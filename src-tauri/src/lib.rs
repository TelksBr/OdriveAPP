mod dfu;
mod hid;
mod serial;
mod sim_games;
mod tray;

use dfu::DfuDeviceInfo;
use hid::{HidDeviceDetail, HidState};
use serial::{PortDetail, SerialState};
use sim_games::SimGameInfo;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

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
fn auto_probe_odrive(app: AppHandle, state: State<'_, AppContext>) -> Result<Option<String>, String> {
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
fn disconnect_hid(state: State<'_, AppContext>) -> Result<(), String> {
    hid::disconnect_hid(&state.hid)
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
fn emergency_stop(state: State<'_, AppContext>) -> Result<(), String> {
    // 1. Send idle to motor: w axis0.requested_state 1\n
    let _ = serial::write_str(&state.serial, "w axis0.requested_state 1\n");
    // 2. Disconnect/pause HID forces
    let _ = hid::disconnect_hid(&state.hid);
    Ok(())
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

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.open_devtools();
            }

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
