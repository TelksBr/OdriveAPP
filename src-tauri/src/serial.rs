use serde::{Deserialize, Serialize};
use serialport::{SerialPort, SerialPortType};
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
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

pub struct SerialState {
    pub writer: Arc<Mutex<Option<Box<dyn SerialPort>>>>,
    pub is_connected: Arc<AtomicBool>,
    pub active_port: Arc<Mutex<Option<String>>>,
    pub stop_signal: Arc<AtomicBool>,
}

impl SerialState {
    pub fn new() -> Self {
        Self {
            writer: Arc::new(Mutex::new(None)),
            is_connected: Arc::new(AtomicBool::new(false)),
            active_port: Arc::new(Mutex::new(None)),
            stop_signal: Arc::new(AtomicBool::new(false)),
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
    state.stop_signal.store(true, Ordering::SeqCst);
    state.is_connected.store(false, Ordering::SeqCst);

    let mut writer_guard = state.writer.lock().map_err(|e| e.to_string())?;
    if let Some(mut port) = writer_guard.take() {
        let _ = port.write_data_terminal_ready(false);
        let _ = port.write_request_to_send(false);
    }

    let mut port_guard = state.active_port.lock().map_err(|e| e.to_string())?;
    *port_guard = None;

    Ok(())
}

/// Connect to a specific COM port
pub fn connect(
    app: AppHandle,
    state: &SerialState,
    port_name: &str,
    baud_rate: u32,
) -> Result<String, String> {
    // Disconnect any existing session
    let _ = disconnect(state);

    let mut port = serialport::new(port_name, baud_rate)
        .timeout(Duration::from_millis(50))
        .open()
        .map_err(|e| format!("Failed to open port {}: {}", port_name, e))?;

    // Assert DTR and RTS so USB CDC ACM on STM32 / ODrive enables communication
    let _ = port.write_data_terminal_ready(true);
    let _ = port.write_request_to_send(true);
    let _ = port.clear(serialport::ClearBuffer::All);

    // Clone port for reading
    let mut reader = port
        .try_clone()
        .map_err(|e| format!("Failed to clone serial port: {}", e))?;

    state.stop_signal.store(false, Ordering::SeqCst);
    state.is_connected.store(true, Ordering::SeqCst);

    {
        let mut writer_guard = state.writer.lock().map_err(|e| e.to_string())?;
        *writer_guard = Some(port);

        let mut port_guard = state.active_port.lock().map_err(|e| e.to_string())?;
        *port_guard = Some(port_name.to_string());
    }

    // Spawn reader thread
    let stop_signal = Arc::clone(&state.stop_signal);
    let is_connected = Arc::clone(&state.is_connected);
    let active_port = Arc::clone(&state.active_port);
    let writer_ref = Arc::clone(&state.writer);
    let app_handle = app.clone();

    thread::spawn(move || {
        let mut buffer = [0u8; 1024];
        let mut line_buffer = String::new();

        while !stop_signal.load(Ordering::SeqCst) {
            match reader.read(&mut buffer) {
                Ok(bytes_read) if bytes_read > 0 => {
                    let text = String::from_utf8_lossy(&buffer[..bytes_read]);
                    for ch in text.chars() {
                        if ch == '\n' {
                            let trimmed = line_buffer.trim().to_string();
                            line_buffer.clear();
                            if !trimmed.is_empty() {
                                let _ = app_handle.emit(
                                    "serial-rx",
                                    SerialEventPayload { line: trimmed },
                                );
                            }
                        } else if ch != '\r' {
                            line_buffer.push(ch);
                        }
                    }
                }
                Ok(_) => {
                    thread::sleep(Duration::from_millis(1));
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                    // Normal timeout for non-blocking read
                }
                Err(_) => {
                    // Physical disconnection or port error
                    if !stop_signal.load(Ordering::SeqCst) {
                        is_connected.store(false, Ordering::SeqCst);
                        if let Ok(mut w) = writer_ref.lock() {
                            *w = None;
                        }
                        if let Ok(mut p) = active_port.lock() {
                            *p = None;
                        }
                        let _ = app_handle.emit("serial-disconnected", ());
                    }
                    break;
                }
            }
        }
    });

    let _ = app.emit("serial-connected", port_name.to_string());
    Ok(port_name.to_string())
}

/// Send raw string to the serial port
pub fn write_str(state: &SerialState, data: &str) -> Result<(), String> {
    let mut writer_guard = state.writer.lock().map_err(|e| e.to_string())?;
    if let Some(port) = writer_guard.as_mut() {
        port.write_all(data.as_bytes())
            .map_err(|e| format!("Serial write failed: {}", e))?;
        port.flush()
            .map_err(|e| format!("Serial flush failed: {}", e))?;
        Ok(())
    } else {
        Err("Serial port is not connected".to_string())
    }
}

/// Auto-detect ODrive-Wheel base by VID:PID or product name
pub fn auto_probe(_app: AppHandle, _state: &SerialState) -> Result<Option<String>, String> {
    let ports = list_ports();

    // Priority 1: Check known VID:PID
    // OpenFFBoard = 0x1209:0x0d40
    // ODrive v3.x CDC = 0x1209:0x0d32 / 0x0d33
    // STMicroelectronics Virtual COM Port = 0x0483:0x5740
    for p in &ports {
        if let (Some(vid), Some(pid)) = (p.vid, p.pid) {
            if (vid == 0x1209 && (pid == 0x0d40 || pid == 0x0d32 || pid == 0x0d33))
                || (vid == 0x0483 && pid == 0x5740)
            {
                return Ok(Some(p.name.clone()));
            }
        }
    }

    // Priority 2: Manufacturer string matches "OpenFFBoard" or "ODrive"
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_ports() {
        let ports = list_ports();
        println!("DETECTED PORTS: {:#?}", ports);
        for p in &ports {
            println!("PORT: {} VID={:?} PID={:?} PROD={:?}", p.name, p.vid, p.pid, p.product);
        }
    }
}
