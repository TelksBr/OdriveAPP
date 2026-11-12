mod dfu;
mod hid;
mod serial;
mod serial_lines;
mod sim_games;
mod tray;

use dfu::DfuDeviceInfo;
use hid::{HidDeviceDetail, HidState};
use serial::{PortDetail, SerialState};
use sim_games::SimGameInfo;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

pub struct AppContext {
    pub serial: Arc<SerialState>,
    pub hid: Arc<HidState>,
}

#[tauri::command]
fn list_serial_ports() -> Vec<PortDetail> {
    serial::list_ports()
}

#[tauri::command]
fn connect_serial(
    app: AppHandle,
    state: State<'_, AppContext>,
    port_name: String,
    baud_rate: Option<u32>,
) -> Result<String, String> {
    serial::connect(app, &state.serial, &port_name, baud_rate.unwrap_or(115200))
}

#[tauri::command]
fn disconnect_serial(state: State<'_, AppContext>) -> Result<(), String> {
    serial::disconnect(&state.serial)
}

#[tauri::command]
fn write_serial(state: State<'_, AppContext>, data: String) -> Result<(), String> {
    serial::write_str(&state.serial, &data)
}

#[tauri::command]
fn query_serial(
    state: State<'_, AppContext>,
    command: String,
    timeout_ms: Option<u64>,
) -> Result<String, String> {
    serial::query_str(
        &state.serial,
        &command,
        std::time::Duration::from_millis(timeout_ms.unwrap_or(2000)),
    )
}

#[tauri::command]
fn auto_probe_odrive(
    app: AppHandle,
    state: State<'_, AppContext>,
) -> Result<Option<String>, String> {
    serial::auto_probe(app, &state.serial)
}

#[tauri::command]
fn list_hid_devices() -> Result<Vec<HidDeviceDetail>, String> {
    hid::list_hid_devices()
}

#[tauri::command]
fn connect_hid(
    app: AppHandle,
    state: State<'_, AppContext>,
    vid: Option<u16>,
    pid: Option<u16>,
) -> Result<String, String> {
    hid::connect_hid(
        app,
        &state.hid,
        vid.unwrap_or(hid::OPENFFBOARD_VID),
        pid.unwrap_or(hid::ODRIVE_WHEEL_PID),
    )
}

#[tauri::command]
fn disconnect_hid(app: AppHandle, state: State<'_, AppContext>) -> Result<(), String> {
    let result = hid::disconnect_hid(&state.hid);
    let _ = app.emit("hid-disconnected", ());
    result
}

#[tauri::command]
fn send_hid_report(
    state: State<'_, AppContext>,
    report_id: u8,
    data: Vec<u8>,
) -> Result<(), String> {
    hid::send_hid_report(&state.hid, report_id, &data)
}

#[tauri::command]
fn detect_running_sim() -> Option<SimGameInfo> {
    sim_games::detect_running_sim()
}

#[tauri::command]
fn emergency_stop(app: AppHandle, state: State<'_, AppContext>) -> Result<(), String> {
    run_emergency_stop_actions(
        || serial::request_idle(&state.serial),
        || hid::stop_all_effects(&state.hid),
        || hid::disconnect_hid(&state.hid),
        || {
            // Notify the UI for the commanded stop as well as physical unplug.
            let _ = app.emit("hid-disconnected", ());
        },
    )
}

fn run_emergency_stop_actions<M, S, D, N>(
    request_idle: M,
    stop_hid: S,
    disconnect_hid: D,
    notify_hid_disconnected: N,
) -> Result<(), String>
where
    M: FnOnce() -> Result<(), String>,
    S: FnOnce() -> Result<(), String>,
    D: FnOnce() -> Result<(), String>,
    N: FnOnce(),
{
    let motor_result = request_idle();
    let hid_stop_result = stop_hid();
    let hid_result = disconnect_hid();
    notify_hid_disconnected();

    match (motor_result, hid_stop_result, hid_result) {
        (Ok(()), Ok(()), Ok(())) => Ok(()),
        (motor, hid_stop, hid) => {
            let mut errors = Vec::new();
            if let Err(error) = motor {
                errors.push(format!("Motor IDLE: {}", error));
            }
            if let Err(error) = hid_stop {
                errors.push(error);
            }
            if let Err(error) = hid {
                errors.push(format!("HID FFB stop: {}", error));
            }
            Err(errors.join("; "))
        }
    }
}

#[cfg(test)]
mod emergency_stop_tests {
    use super::run_emergency_stop_actions;
    use std::cell::Cell;

    #[test]
    fn attempts_hid_stop_and_disconnect_when_motor_idle_fails() {
        let hid_stop_called = Cell::new(false);
        let hid_disconnect_called = Cell::new(false);
        let notification_called = Cell::new(false);

        let result = run_emergency_stop_actions(
            || Err("COM write failed".to_string()),
            || {
                hid_stop_called.set(true);
                Ok(())
            },
            || {
                hid_disconnect_called.set(true);
                Ok(())
            },
            || notification_called.set(true),
        );

        assert_eq!(result.unwrap_err(), "Motor IDLE: COM write failed");
        assert!(hid_stop_called.get());
        assert!(hid_disconnect_called.get());
        assert!(notification_called.get());
    }

    #[test]
    fn reports_idle_and_hid_stop_failures_together() {
        let result = run_emergency_stop_actions(
            || Err("state remained closed-loop".to_string()),
            || Err("device removed".to_string()),
            || Ok(()),
            || {},
        );

        assert_eq!(
            result.unwrap_err(),
            "Motor IDLE: state remained closed-loop; device removed"
        );
    }
}

#[tauri::command]
fn detect_dfu_device() -> Result<Option<DfuDeviceInfo>, String> {
    dfu::detect_dfu_device()
}

#[tauri::command]
fn flash_firmware(app: AppHandle, binary_bytes: Vec<u8>) -> Result<String, String> {
    dfu::flash_firmware(app, binary_bytes)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Purge any stale WebView2 Service Worker and CacheStorage from previous PWA builds
    if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
        let sw_cache = std::path::PathBuf::from(local_appdata)
            .join("com.wheelforge.desktop")
            .join("EBWebView")
            .join("Default")
            .join("Service Worker");
        if sw_cache.exists() {
            let _ = std::fs::remove_dir_all(sw_cache);
        }
    }

    let serial_state = Arc::new(SerialState::new());
    let hid_state = Arc::new(HidState::new());

    let app_context = AppContext {
        serial: Arc::clone(&serial_state),
        hid: Arc::clone(&hid_state),
    };

    tauri::Builder::default()
        .manage(app_context)
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Setup system tray
            let _ = tray::setup_tray(app.handle());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_serial_ports,
            connect_serial,
            disconnect_serial,
            write_serial,
            query_serial,
            auto_probe_odrive,
            list_hid_devices,
            connect_hid,
            disconnect_hid,
            send_hid_report,
            detect_running_sim,
            emergency_stop,
            detect_dfu_device,
            flash_firmware,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
