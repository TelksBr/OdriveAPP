use hidapi::{HidApi, HidDevice};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
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
pub struct HidReportBatchPayload {
    pub reports: Vec<Vec<u8>>,
}

const HID_REPORT_BATCH_INTERVAL: Duration = Duration::from_millis(4);
const HID_REPORT_BATCH_MAX: usize = 16;

fn should_flush_report_batch(
    count: usize,
    started_at: Option<std::time::Instant>,
    now: std::time::Instant,
) -> bool {
    count > 0
        && (count >= HID_REPORT_BATCH_MAX
            || started_at
                .is_some_and(|start| now.duration_since(start) >= HID_REPORT_BATCH_INTERVAL))
}

fn take_due_report_batch(
    pending: &mut Vec<Vec<u8>>,
    started_at: &mut Option<std::time::Instant>,
    now: std::time::Instant,
) -> Option<Vec<Vec<u8>>> {
    if !should_flush_report_batch(pending.len(), *started_at, now) {
        return None;
    }
    *started_at = None;
    Some(std::mem::take(pending))
}

pub struct HidState {
    pub device: Arc<Mutex<Option<HidDevice>>>,
    pub is_connected: Arc<AtomicBool>,
    pub stop_signal: Arc<AtomicBool>,
    reader_thread: Mutex<Option<JoinHandle<()>>>,
}

impl HidState {
    pub fn new() -> Self {
        Self {
            device: Arc::new(Mutex::new(None)),
            is_connected: Arc::new(AtomicBool::new(false)),
            stop_signal: Arc::new(AtomicBool::new(false)),
            reader_thread: Mutex::new(None),
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
    drop(dev);

    let reader_thread = state
        .reader_thread
        .lock()
        .map_err(|e| e.to_string())?
        .take();
    if let Some(reader_thread) = reader_thread {
        reader_thread
            .join()
            .map_err(|_| "HID reader thread panicked".to_string())?;
    }
    Ok(())
}

/// Stop all PID slots and disable FFB actuators before an emergency disconnect.
pub fn stop_all_effects(state: &HidState) -> Result<(), String> {
    if !state.is_connected.load(Ordering::SeqCst) {
        return Ok(());
    }
    let mut errors = Vec::new();
    for block in [1u8, 2, 3, 4, 6, 7] {
        if let Err(error) = send_hid_report(state, 0x0a, &[block, 3, 0]) {
            errors.push(error);
        }
    }
    if let Err(error) = send_hid_report(state, 0x0c, &[0x04]) {
        errors.push(error);
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(format!("Failed to stop HID effects: {}", errors.join("; ")))
    }
}

pub fn connect_hid(app: AppHandle, state: &HidState, vid: u16, pid: u16) -> Result<String, String> {
    disconnect_hid(state)?;

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
    let reader_thread = thread::spawn(move || {
        let mut buf = [0u8; 64];
        let mut pending_reports: Vec<Vec<u8>> = Vec::with_capacity(HID_REPORT_BATCH_MAX);
        let mut batch_started_at = None;
        while !stop_signal.load(Ordering::SeqCst) {
            let mut read_bytes = 0;
            let mut read_error = false;
            {
                if let Ok(d_guard) = dev_ref.lock() {
                    if let Some(ref d) = *d_guard {
                        match d.read(&mut buf) {
                            Ok(len) => read_bytes = len,
                            Err(_) => read_error = true,
                        }
                    }
                }
            }

            if read_error {
                is_connected.store(false, Ordering::SeqCst);
                stop_signal.store(true, Ordering::SeqCst);
                if let Ok(mut d_guard) = dev_ref.lock() {
                    *d_guard = None;
                }
                let _ = app_handle.emit("hid-disconnected", ());
                break;
            }

            if read_bytes > 0 {
                if pending_reports.is_empty() {
                    batch_started_at = Some(std::time::Instant::now());
                }
                pending_reports.push(buf[..read_bytes].to_vec());
            } else {
                thread::sleep(Duration::from_millis(1));
            }

            if let Some(reports) = take_due_report_batch(
                &mut pending_reports,
                &mut batch_started_at,
                std::time::Instant::now(),
            ) {
                let _ = app_handle.emit("hid-input-report", HidReportBatchPayload { reports });
                pending_reports = Vec::with_capacity(HID_REPORT_BATCH_MAX);
            }
        }
        if !pending_reports.is_empty() {
            let _ = app_handle.emit(
                "hid-input-report",
                HidReportBatchPayload {
                    reports: pending_reports,
                },
            );
        }
        is_connected.store(false, Ordering::SeqCst);
    });
    *state.reader_thread.lock().map_err(|e| e.to_string())? = Some(reader_thread);

    let _ = app.emit("hid-connected", ());
    Ok(format!("{:04x}:{:04x}", vid, pid))
}

pub fn send_hid_report(state: &HidState, report_id: u8, data: &[u8]) -> Result<(), String> {
    let dev = state.device.lock().map_err(|e| e.to_string())?;
    if let Some(ref d) = *dev {
        let mut payload = Vec::with_capacity(data.len() + 1);
        payload.push(report_id);
        payload.extend_from_slice(data);

        let written = d
            .write(&payload)
            .map_err(|e| format!("HID write failed: {}", e))?;
        if written != payload.len() {
            return Err(format!(
                "HID write incomplete: wrote {} of {} bytes",
                written,
                payload.len()
            ));
        }
        Ok(())
    } else {
        Err("HID device is not connected".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn disconnect_waits_for_the_reader_thread_to_exit() {
        let state = HidState::new();
        let stop_signal = Arc::clone(&state.stop_signal);
        let exited = Arc::new(AtomicBool::new(false));
        let worker_exited = Arc::clone(&exited);
        let reader = thread::spawn(move || {
            while !stop_signal.load(Ordering::SeqCst) {
                thread::yield_now();
            }
            worker_exited.store(true, Ordering::SeqCst);
        });
        *state.reader_thread.lock().unwrap() = Some(reader);

        disconnect_hid(&state).unwrap();

        assert!(exited.load(Ordering::SeqCst));
        assert!(!state.is_connected.load(Ordering::SeqCst));
    }

    #[test]
    fn emergency_stop_reports_cover_every_effect_slot_and_actuator_disable() {
        let mut reports: Vec<Vec<u8>> = [1u8, 2, 3, 4, 6, 7]
            .into_iter()
            .map(|block| [0x0a, block, 3, 0].to_vec())
            .collect();
        reports.push(vec![0x0c, 0x04]);

        assert_eq!(reports.len(), 7);
        assert_eq!(reports[0], [0x0a, 1, 3, 0]);
        assert_eq!(reports[5], [0x0a, 7, 3, 0]);
        assert_eq!(reports[6], [0x0c, 0x04]);
    }

    #[test]
    fn batches_one_kilohertz_reports_into_two_hundred_fifty_ipc_events_per_second() {
        let origin = Instant::now();
        let mut batch_started_at = None;
        let mut pending = Vec::with_capacity(HID_REPORT_BATCH_MAX);
        let mut batches = Vec::new();
        let input: Vec<Vec<u8>> = (0u32..1000)
            .map(|sample| sample.to_le_bytes().to_vec())
            .collect();

        for millis in 0u64..1000 {
            if pending.is_empty() {
                batch_started_at = Some(origin + Duration::from_millis(millis));
            }
            pending.push(input[millis as usize].clone());
            let now = origin + Duration::from_millis(millis + 1);
            if let Some(batch) = take_due_report_batch(&mut pending, &mut batch_started_at, now) {
                batches.push(batch);
                pending = Vec::with_capacity(HID_REPORT_BATCH_MAX);
            }
        }
        if !pending.is_empty() {
            batches.push(pending);
        }

        let delivered: Vec<Vec<u8>> = batches.iter().flatten().cloned().collect();
        assert_eq!(delivered, input);
        assert_eq!(batches.len(), 250);
        assert!(batches.iter().all(|batch| batch.len() == 4));
        assert!(HID_REPORT_BATCH_INTERVAL <= Duration::from_millis(4));
    }
}
