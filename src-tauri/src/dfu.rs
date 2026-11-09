use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DfuDeviceInfo {
    pub name: String,
    pub serial_number: Option<String>,
    pub port: String,
    pub programmer_found: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DfuProgressPayload {
    pub message: String,
    pub progress: Option<u32>,
}

pub fn find_stm32_programmer() -> Option<PathBuf> {
    // 1. Check standard 64-bit installation path
    let standard = PathBuf::from(
        r"C:\Program Files\STMicroelectronics\STM32Cube\STM32CubeProgrammer\bin\STM32_Programmer_CLI.exe",
    );
    if standard.exists() {
        return Some(standard);
    }

    // 2. Check 32-bit x86 path
    let x86 = PathBuf::from(
        r"C:\Program Files (x86)\STMicroelectronics\STM32Cube\STM32CubeProgrammer\bin\STM32_Programmer_CLI.exe",
    );
    if x86.exists() {
        return Some(x86);
    }

    // 3. Check custom env var if configured
    if let Ok(custom) = env::var("STM32_PROGRAMMER_CLI") {
        let p = PathBuf::from(custom);
        if p.exists() {
            return Some(p);
        }
    }

    // 4. Try PATH via where.exe
    if let Ok(output) = Command::new("where.exe")
        .arg("STM32_Programmer_CLI.exe")
        .output()
    {
        if output.status.success() {
            let out_str = String::from_utf8_lossy(&output.stdout);
            if let Some(first_line) = out_str.lines().next() {
                let p = PathBuf::from(first_line.trim());
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }

    None
}

/// Detects if an STM32 device is currently attached in DFU mode.
pub fn detect_dfu_device() -> Result<Option<DfuDeviceInfo>, String> {
    if let Some(cli_path) = find_stm32_programmer() {
        let output = Command::new(&cli_path)
            .args(["-l", "usb"])
            .output()
            .map_err(|e| format!("Falha ao executar STM32_Programmer_CLI: {}", e))?;

        let text = String::from_utf8_lossy(&output.stdout);
        let lower = text.to_lowercase();
        if lower.contains("available stm32 device in dfu mode") {
            let mut sn = None;
            let mut port = "usb1".to_string();
            let mut dev_count = 0;

            for line in text.lines() {
                let trimmed = line.trim();
                let trimmed_lower = trimmed.to_lowercase();
                if trimmed_lower.contains("available stm32 device in dfu mode") {
                    if let Some(count_str) = trimmed.split(':').nth(1) {
                        dev_count = count_str.trim().parse::<u32>().unwrap_or(0);
                    }
                } else if trimmed_lower.contains("serial number") {
                    if let Some(val) = trimmed.split(':').nth(1) {
                        sn = Some(val.trim().to_string());
                    }
                } else if trimmed_lower.contains("device index") {
                    if let Some(val) = trimmed.split(':').nth(1) {
                        port = val.trim().to_lowercase();
                    }
                }
            }

            if dev_count > 0 {
                return Ok(Some(DfuDeviceInfo {
                    name: "STM32 BOOTLOADER".to_string(),
                    serial_number: sn,
                    port,
                    programmer_found: true,
                }));
            }
        }
    }

    Ok(None)
}

/// Flashes firmware safely to STM32, preserving FFB EEPROM (Sectors 1 and 2).
pub fn flash_firmware(app: AppHandle, binary_bytes: Vec<u8>) -> Result<String, String> {
    let cli_path = find_stm32_programmer().ok_or_else(|| {
        "STM32CubeProgrammer CLI não encontrado no sistema. Por favor, instale o STM32CubeProgrammer em C:\\Program Files\\STMicroelectronics\\STM32Cube\\STM32CubeProgrammer\\bin\\STM32_Programmer_CLI.exe".to_string()
    })?;

    if binary_bytes.is_empty() {
        return Err("Arquivo de firmware vazio.".to_string());
    }

    let emit = |msg: &str, progress: Option<u32>| {
        let _ = app.emit(
            "dfu-progress",
            DfuProgressPayload {
                message: msg.to_string(),
                progress,
            },
        );
    };

    emit("Preparando partições de gravação (preservando EEPROM FFB S1+S2)...", Some(5));

    let temp_dir = env::temp_dir();
    let s0_path = temp_dir.join("wf_s0.bin");
    let s3_path = temp_dir.join("wf_s3.bin");

    // Sector 0: 0x08000000..0x08004000 (16 KB)
    // Sector 1+2: 0x08004000..0x0800C000 (32 KB, FFB EEPROM - PRESERVED!)
    // Sector 3..: 0x0800C000.. (Main program)
    const S0_SIZE: usize = 16 * 1024;
    const S1_S2_END: usize = 48 * 1024;

    let total_len = binary_bytes.len();
    if total_len <= S0_SIZE {
        fs::write(&s0_path, &binary_bytes).map_err(|e| e.to_string())?;
        emit("Gravando Sector 0...", Some(20));
        let mut child = Command::new(&cli_path)
            .args([
                "-c",
                "port=usb1",
                "-d",
                s0_path.to_str().unwrap(),
                "0x08000000",
                "-v",
                "-s",
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Falha ao iniciar STM32_Programmer_CLI: {}", e))?;

        let _ = child.wait();
        let _ = fs::remove_file(&s0_path);
        emit("Gravação concluída com sucesso! Placa reiniciada.", Some(100));
        return Ok("Gravação concluída com sucesso! Placa reiniciada.".to_string());
    }

    let s0_bytes = &binary_bytes[..S0_SIZE];
    fs::write(&s0_path, s0_bytes).map_err(|e| e.to_string())?;

    let has_s3 = total_len > S1_S2_END;
    let mut args = vec![
        "-c".to_string(),
        "port=usb1".to_string(),
        "-d".to_string(),
        s0_path.to_str().unwrap().to_string(),
        "0x08000000".to_string(),
    ];

    if has_s3 {
        let s3_bytes = &binary_bytes[S1_S2_END..];
        fs::write(&s3_path, s3_bytes).map_err(|e| e.to_string())?;
        args.push("-d".to_string());
        args.push(s3_path.to_str().unwrap().to_string());
        args.push("0x0800C000".to_string());
    }

    args.push("-v".to_string());
    args.push("-s".to_string());

    emit("Conectando ao STM32 Bootloader e iniciando download...", Some(15));

    let mut child = Command::new(&cli_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Falha ao iniciar STM32_Programmer_CLI: {}", e))?;

    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        for line in reader.lines().flatten() {
            let line_trim = line.trim();
            if line_trim.contains("Download in Progress") || line_trim.contains("%") {
                emit(line_trim, Some(50));
            } else if line_trim.contains("File download complete") {
                emit("Download concluído. Verificando integridade...", Some(80));
            } else if line_trim.contains("Verifying") {
                emit("Verificando dados gravados na Flash...", Some(85));
            } else if line_trim.contains("Download verified successfully") {
                emit("Verificação concluída com sucesso! Reiniciando firmware...", Some(95));
            } else if line_trim.contains("Start operation achieved successfully") {
                emit("Firmware iniciado! Placa voltando ao modo normal.", Some(100));
            }
        }
    }

    let status = child.wait().map_err(|e| e.to_string())?;

    // Cleanup temp files
    let _ = fs::remove_file(&s0_path);
    if has_s3 {
        let _ = fs::remove_file(&s3_path);
    }

    if !status.success() {
        return Err(format!("STM32CubeProgrammer encerrou com código de saída: {:?}", status.code()));
    }

    emit("DFU concluído com sucesso — a placa foi reiniciada!", Some(100));
    Ok("Gravação concluída com sucesso! Placa reiniciada.".to_string())
}

