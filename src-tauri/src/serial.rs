use crate::serial_lines::{route_query_lines, SerialLineBuffer};
use serde::{Deserialize, Serialize};
use serialport::SerialPortType;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortDetail {
    pub name: String,
    pub vid: Option<u16>,
    pub pid: Option<u16>,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub serial_number: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerialEventPayload {
    pub line: String,
}

enum SerialRequest {
    Query {
        command: String,
        responder: Sender<Result<String, String>>,
        timeout: Duration,
    },
    Write {
        data: String,
    },
    Disconnect,
}

pub struct SerialState {
    tx: Arc<Mutex<Option<Sender<SerialRequest>>>>,
    pub is_connected: Arc<AtomicBool>,
    pub active_port: Arc<Mutex<Option<String>>>,
}

impl SerialState {
    pub fn new() -> Self {
        Self {
            tx: Arc::new(Mutex::new(None)),
            is_connected: Arc::new(AtomicBool::new(false)),
            active_port: Arc::new(Mutex::new(None)),
        }
    }
}

/// Enumerate all available serial ports on Windows
pub fn list_ports() -> Vec<PortDetail> {
    let mut results = Vec::new();
    if let Ok(ports) = serialport::available_ports() {
        for p in ports {
            let mut vid = None;
            let mut pid = None;
            let mut manufacturer = None;
            let mut product = None;
            let mut serial_number = None;

            if let SerialPortType::UsbPort(usb) = p.port_type {
                vid = Some(usb.vid);
                pid = Some(usb.pid);
                manufacturer = usb.manufacturer;
                product = usb.product;
                serial_number = usb.serial_number;
            }

            results.push(PortDetail {
                name: p.port_name,
                vid,
                pid,
                manufacturer,
                product,
                serial_number,
            });
        }
    }
    results
}

/// Disconnect current serial port
pub fn disconnect(state: &SerialState) -> Result<(), String> {
    state.is_connected.store(false, Ordering::SeqCst);

    let mut tx_guard = state.tx.lock().map_err(|e| e.to_string())?;
    if let Some(sender) = tx_guard.take() {
        let _ = sender.send(SerialRequest::Disconnect);
    }

    let mut port_guard = state.active_port.lock().map_err(|e| e.to_string())?;
    *port_guard = None;

    Ok(())
}

/// Connect to a specific COM port with dedicated ultra-low-latency worker thread
pub fn connect(
    app: AppHandle,
    state: &SerialState,
    port_name: &str,
    baud_rate: u32,
) -> Result<String, String> {
    // Disconnect any existing session
    let _ = disconnect(state);

    let mut port = serialport::new(port_name, baud_rate)
        .timeout(Duration::from_millis(5))
        .open()
        .map_err(|e| format!("Failed to open port {}: {}", port_name, e))?;

    // Assert DTR and RTS so USB CDC ACM on STM32 / ODrive enables communication
    let _ = port.write_data_terminal_ready(true);
    let _ = port.write_request_to_send(true);
    let _ = port.clear(serialport::ClearBuffer::All);

    let (req_tx, req_rx): (Sender<SerialRequest>, Receiver<SerialRequest>) = channel();

    {
        let mut tx_guard = state.tx.lock().map_err(|e| e.to_string())?;
        *tx_guard = Some(req_tx);

        let mut port_guard = state.active_port.lock().map_err(|e| e.to_string())?;
        *port_guard = Some(port_name.to_string());
    }

    state.is_connected.store(true, Ordering::SeqCst);

    // Spawn single dedicated serial worker thread (eliminates all Windows driver handle lock contention)
    let app_handle = app.clone();
    let is_connected = Arc::clone(&state.is_connected);
    let active_port = Arc::clone(&state.active_port);
    let tx_holder = Arc::clone(&state.tx);

    thread::spawn(move || {
        let mut read_buf = [0u8; 1024];
        let mut line_buffer = SerialLineBuffer::default();

        loop {
            // Wait for outgoing requests with short timeout to also process any incoming unsolicited data
            match req_rx.recv_timeout(Duration::from_millis(15)) {
                Ok(SerialRequest::Query {
                    command,
                    responder,
                    timeout,
                }) => {
                    // 1. Clear any leftover unread noise in buffer
                    // Discard an incomplete unsolicited line too, so its tail
                    // cannot be mistaken for this command's response.
                    let _ = line_buffer.take_partial();
                    let _ = port.clear(serialport::ClearBuffer::Input);

                    // 2. Transmit command
                    let cmd_str = if command.ends_with('\n') {
                        command.clone()
                    } else {
                        format!("{}\n", command)
                    };

                    if let Err(e) = port.write_all(cmd_str.as_bytes()) {
                        let _ = responder.send(Err(format!("Serial write failed: {}", e)));
                        continue;
                    }

                    // 3. Read response until newline or timeout
                    let start = Instant::now();
                    let mut got_reply = false;

                    while start.elapsed() < timeout {
                        match port.read(&mut read_buf) {
                            Ok(n) if n > 0 => {
                                let (reply, unsolicited) = route_query_lines(
                                    &command,
                                    line_buffer.push(&read_buf[..n]),
                                    got_reply,
                                );
                                if let Some(reply) = reply {
                                    got_reply = true;
                                    let _ = responder.send(Ok(reply));
                                }
                                for line in unsolicited {
                                    let _ =
                                        app_handle.emit("serial-rx", SerialEventPayload { line });
                                }
                                if got_reply {
                                    break;
                                }
                            }
                            Ok(_) => {
                                thread::sleep(Duration::from_micros(100));
                            }
                            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                                // Short driver timeout expired, continue waiting up to query timeout
                            }
                            Err(e) => {
                                let _ = responder.send(Err(format!("Serial read error: {}", e)));
                                got_reply = true;
                                break;
                            }
                        }
                    }

                    if !got_reply {
                        let _ = responder
                            .send(Err(format!("Timeout waiting for reply to: {}", command)));
                    }
                }
                Ok(SerialRequest::Write { data }) => {
                    let cmd_str = if data.ends_with('\n') {
                        data
                    } else {
                        format!("{}\n", data)
                    };
                    let _ = port.write_all(cmd_str.as_bytes());
                }
                Ok(SerialRequest::Disconnect) => {
                    let _ = port.write_data_terminal_ready(false);
                    let _ = port.write_request_to_send(false);
                    break;
                }
                Err(RecvTimeoutError::Timeout) => {
                    // Check for any unsolicited messages
                    match port.read(&mut read_buf) {
                        Ok(n) if n > 0 => {
                            for line in line_buffer.push(&read_buf[..n]) {
                                let _ = app_handle.emit("serial-rx", SerialEventPayload { line });
                            }
                        }
                        _ => {}
                    }
                }
                Err(RecvTimeoutError::Disconnected) => {
                    break;
                }
            }
        }

        is_connected.store(false, Ordering::SeqCst);
        if let Ok(mut p) = active_port.lock() {
            *p = None;
        }
        if let Ok(mut tx) = tx_holder.lock() {
            *tx = None;
        }
        let _ = app_handle.emit("serial-disconnected", ());
    });

    let _ = app.emit("serial-connected", port_name.to_string());
    Ok(port_name.to_string())
}

/// Synchronous round-trip command query (1 ms latency, zero IPC event queue delays)
pub fn query_str(state: &SerialState, command: &str, timeout: Duration) -> Result<String, String> {
    let (responder, receiver) = channel();

    {
        let tx_guard = state.tx.lock().map_err(|e| e.to_string())?;
        let sender = tx_guard
            .as_ref()
            .ok_or_else(|| "Serial port is not connected".to_string())?;

        sender
            .send(SerialRequest::Query {
                command: command.to_string(),
                responder,
                timeout,
            })
            .map_err(|e| e.to_string())?;
    }

    receiver
        .recv_timeout(timeout + Duration::from_millis(50))
        .map_err(|e| format!("Query response timeout: {}", e))?
}

/// Send raw string to the serial port asynchronously
pub fn write_str(state: &SerialState, data: &str) -> Result<(), String> {
    let tx_guard = state.tx.lock().map_err(|e| e.to_string())?;
    if let Some(sender) = tx_guard.as_ref() {
        sender
            .send(SerialRequest::Write {
                data: data.to_string(),
            })
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Serial port is not connected".to_string())
    }
}

/// Auto-detect ODrive-Wheel base by VID:PID or product name
pub fn auto_probe(_app: AppHandle, _state: &SerialState) -> Result<Option<String>, String> {
    let ports = list_ports();

    for p in &ports {
        if let (Some(vid), Some(pid)) = (p.vid, p.pid) {
            if (vid == 0x1209 && (pid == 0x0d40 || pid == 0x0d32 || pid == 0x0d33))
                || (vid == 0x0483 && pid == 0x5740)
            {
                return Ok(Some(p.name.clone()));
            }
        }
    }

    for p in &ports {
        if let Some(ref m) = p.manufacturer {
            if m.contains("ODrive") || m.contains("OpenFFBoard") {
                return Ok(Some(p.name.clone()));
            }
        }
        if let Some(ref prod) = p.product {
            if prod.contains("ODrive") || prod.contains("OpenFFBoard") {
                return Ok(Some(p.name.clone()));
            }
        }
    }

    Ok(None)
}
