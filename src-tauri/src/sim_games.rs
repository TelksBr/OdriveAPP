use serde::{Deserialize, Serialize};
use sysinfo::System;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimGameInfo {
    pub id: String,
    pub name: String,
    pub executable: String,
}

const KNOWN_GAMES: &[(&str, &str, &str)] = &[
    ("assetto-corsa", "Assetto Corsa", "acs.exe"),
    ("assetto-corsa-alt", "Assetto Corsa", "AssettoCorsa.exe"),
    ("acc", "Assetto Corsa Competizione", "acc.exe"),
    ("iracing", "iRacing", "iRacingSim64DX11.exe"),
    ("beamng", "BeamNG.drive", "BeamNG.drive.x64.exe"),
    ("rfactor2", "rFactor 2", "rFactor2.exe"),
    ("f1-24", "EA Sports F1 24", "F1_24.exe"),
    ("f1-23", "EA Sports F1 23", "F1_23.exe"),
    ("f1-22", "EA Sports F1 22", "F1_22.exe"),
    ("ams2", "Automobilista 2", "Automobilista2.exe"),
    ("ams2-avx", "Automobilista 2", "AMS2AVX.exe"),
    ("lmu", "Le Mans Ultimate", "LeMansUltimate.exe"),
    ("wrc", "EA Sports WRC", "WRC.exe"),
    ("dirt-rally-2", "DiRT Rally 2.0", "dirtrally2.exe"),
    ("forza-motorsport", "Forza Motorsport", "ForzaMotorsport.exe"),
];

pub fn detect_running_sim() -> Option<SimGameInfo> {
    let mut sys = System::new_all();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    for process in sys.processes().values() {
        let proc_name = process.name().to_string_lossy();
        for &(id, name, exe) in KNOWN_GAMES {
            if proc_name.eq_ignore_ascii_case(exe) {
                return Some(SimGameInfo {
                    id: id.to_string(),
                    name: name.to_string(),
                    executable: exe.to_string(),
                });
            }
        }
    }

    None
}

