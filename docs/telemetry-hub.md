# WheelForge Telemetry Hub

Standalone **Go** binary (`dist/wheelforge-hub.exe`) that reads OpenFFBoard telemetry over CDC serial, serves a LAN overlay (HTML embedded in the exe), and streams JSON over **WebSocket** and **UDP**.

## Architecture

```
OpenFFBoard CDC (COM6) → wheelforge-hub (Go) → WebSocket / UDP / REST
                              ├─ http://PC:8765/overlay/     (LAN overlay + charts)
                              ├─ ws://127.0.0.1:8765/live   (WebSocket stream)
                              ├─ GET /api/stats             (min/max/avg)
                              └─ UDP 127.0.0.1:45890        (optional broadcast)
```

Sources of truth:

| Asset | Path |
|-------|------|
| Overlay UI | `tools/overlay-lan/` → embedded at build |
| Go hub | `tools/wheelforge-hub/` |

## Quick start (Windows)

1. Install [Go](https://go.dev/dl/) (build once) or use `dist/wheelforge-hub.exe`.
2. Build: `powershell -ExecutionPolicy Bypass -File scripts/Build-TelemetryHub.ps1`
3. Run: `powershell -ExecutionPolicy Bypass -File scripts/Start-TelemetryHub.ps1 -GameMode`
4. Open `http://localhost:8765/overlay/`

## API

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Hub status, last Vbus/Ibus |
| `GET /api/snapshot?windowMs=60000` | Sample ring buffer |
| `GET /api/stats?windowMs=60000` | Per-field min, max, avg, last |
| `WS /live` | Live JSON packets + initial snapshot |

Packet format (`v: 1`):

```json
{ "v": 1, "t": 1710000000000, "vbus": 35.3, "ibus": 0.12, "iq": 0.5, "torqueNm": 1.2, "source": "serial", "hz": 2.0 }
```

## CLI flags

- `--port 8765`
- `--udp-port 45890`
- `--chart-hz 30`
- `--serial COM6`
- `--serial-only` / `--game-mode`

## Game mode

```powershell
.\scripts\Start-TelemetryHub.ps1 -GameMode -SerialPort COM6
```

- **Game** → HID FFB
- **Hub** → CDC serial COM6 (parallel, not fallback)
- Close WheelForge browser serial tab if COM6 access denied

## Overlay features

- Live values (Vbus, Ibus, Iq, Torque, Position, Velocity)
- **Min / max / average** over configurable window (30s–5m)
- **Charts** — real-time canvas graphs

## Build pipeline

```powershell
npm run hub:build-overlay   # overlay-lan → Go embed tree
npm run hub:build           # compile dist/wheelforge-hub.exe
npm run hub                 # start hub (GameMode)
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| COM6 access denied | Disconnect serial in WheelForge browser |
| Overlay empty | Hub serial-only with correct COM |
| LAN blocked | `Start-TelemetryHub.ps1 -AllowFirewall` |
