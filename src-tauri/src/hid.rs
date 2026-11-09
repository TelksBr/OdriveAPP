use hidapi::{HidApi, HidDevice};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub const OPENFFBOARD_VID: u16 = 0x1209;
pub const ODRIVE_WHEEL_PID: u16 = 0x0d40;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HidDeviceDetail {
    pub path: String,
    pub vendor_id: u16,
    pub product_id: u16,
    pub manufacturer_string: Option<String>,
    pub product_string: Option<String>,
    pub serial_number: Option<String>,
    pub usage_page: u16,
    pub usage: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HidReportPayload {
    pub data: Vec<u8>,
}

pub struct HidState {
    pub device: Arc<Mutex<Option<HidDevice>>>,
    pub is_connected: Arc<AtomicBool>,
    pub stop_signal: Arc<AtomicBool>,
}

impl HidState {
    pub fn new() -> Self {
        Self {
            device: Arc::new(Mutex::new(None)),
            is_connected: Arc::new(AtomicBool::new(false)),
            stop_signal: Arc::new(AtomicBool::new(false)),
        }
    }
}

pub fn list_hid_devices() -> Result<Vec<HidDeviceDetail>, String> {
    let api = HidApi::new().map_err(|e| e.to_string())?;
    let mut list = Vec::new();

    for d in api.device_list() {
        list.push(HidDeviceDetail {
            path: d.path().to_string_lossy().to_string(),
            vendor_id: d.vendor_id(),
            product_id: d.product_id(),
            manufacturer_string: d.manufacturer_string().map(|s| s.to_string()),
            product_string: d.product_string().map(|s| s.to_string()),
            serial_number: d.serial_number().map(|s| s.to_string()),
            usage_page: d.usage_page(),
            usage: d.usage(),
        });
    }

    Ok(list)
}

pub fn disconnect_hid(state: &HidState) -> Result<(), String> {
    state.stop_signal.store(true, Ordering::SeqCst);
    state.is_connected.store(false, Ordering::SeqCst);

    let mut dev = state.device.lock().map_err(|e| e.to_string())?;
    *dev = None;
    Ok(())
}

pub fn connect_hid(
    app: AppHandle,
    state: &HidState,
    vid: u16,
    pid: u16,
) -> Result<String, String> {
    let _ = disconnect_hid(state);

    let api = HidApi::new().map_err(|e| e.to_string())?;
    let device = api
        .open(vid, pid)
        .map_err(|e| format!("Failed to open HID device {:04x}:{:04x}: {}", vid, pid, e))?;

    device
        .set_blocking_mode(false)
        .map_err(|e| format!("Failed to set non-blocking mode: {}", e))?;

    state.stop_signal.store(false, Ordering::SeqCst);
    state.is_connected.store(true, Ordering::SeqCst);

    let dev_mutex = Arc::clone(&state.device);
    {
        let mut d = dev_mutex.lock().map_err(|e| e.to_string())?;
        *d = Some(device);
    }

    let stop_signal = Arc::clone(&state.stop_signal);
    let is_connected = Arc::clone(&state.is_connected);
    let app_handle = app.clone();

    // Spawn 1 kHz reader thread for input reports (pedals, buttons, high-frequency position)
    let dev_ref = Arc::clone(&state.device);
    thread::spawn(move || {
        let mut buf = [0u8; 64];
        while !stop_signal.load(Ordering::SeqCst) {
            let mut read_bytes = 0;
            {
                if let Ok(d_guard) = dev_ref.lock() {
                    if let Some(ref d) = *d_guard {
                        if let Ok(len) = d.read(&mut buf) {
                            read_bytes = len;
                        }
                    }
                }
            }

            if read_bytes > 0 {
                let _ = app_handle.emit(
                    "hid-input-report",
                    HidReportPayload {
                        data: buf[..read_bytes].to_vec(),
                    },
                );
            } else {
                thread::sleep(Duration::from_millis(1));
            }
        }
        is_connected.store(false, Ordering::SeqCst);
    });

    let _ = app.emit("hid-connected", ());
    Ok(format!("{:04x}:{:04x}", vid, pid))
}

pub fn send_hid_report(state: &HidState, report_id: u8, data: &[u8]) -> Result<(), String> {
    let dev = state.device.lock().map_err(|e| e.to_string())?;
    if let Some(ref d) = *dev {
        let mut payload = Vec::with_capacity(data.len() + 1);
        payload.push(report_id);
        payload.extend_from_slice(data);

        d.write(&payload)
            .map_err(|e| format!("HID write failed: {}", e))?;
        Ok(())
    } else {
        Err("HID device is not connected".to_string())
    }
}

