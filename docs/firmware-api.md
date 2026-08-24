# WheelForge — protocol reference (Odrive-Wheel firmware)

Referência do protocolo **Odrive-Wheel** (firmware FFB + ODrive) para manutenção desta PWA.

**Público:** desenvolvedores da web app, integradores serial/HID, e quem mantém `fieldCatalog.ts`.

**Referências cruzadas:**
- App web: `src/`
- Firmware upstream: [github.com/eagabriel/Odrive-Wheel](https://github.com/eagabriel/Odrive-Wheel)
- Configurador HTML legado: incluído no repositório upstream (`tools/odrive-wheel.html`)

---

## Índice

1. [Visão geral da arquitetura](#1-visão-geral-da-arquitetura)
2. [Transporte USB](#2-transporte-usb)
3. [Protocolo serial duplo](#3-protocolo-serial-duplo)
4. [OpenFFBoard — sintaxe e classes](#4-openffboard--sintaxe-e-classes)
5. [ODrive ASCII — propriedades e comandos](#5-odrive-ascii--propriedades-e-comandos)
6. [Estados do eixo e calibração](#6-estados-do-eixo-e-calibração)
7. [Registos de erro](#7-registos-de-erro)
8. [Comandos de diagnóstico FFB](#8-comandos-de-diagnóstico-ffb)
9. [Persistência — duas memórias](#9-persistência--duas-memórias)
10. [Stack HID / FFB](#10-stack-hid--ffb)
11. [GPIO e entradas analógicas](#11-gpio-e-entradas-analógicas)
12. [Bridge ODrive (`odrive_bridge`)](#12-bridge-odrive-odrive_bridge)
13. [Mapa firmware → web app](#13-mapa-firmware--web-app)
14. [Ficheiros-fonte por tema](#14-ficheiros-fonte-por-tema)
15. [Boas práticas para a web app](#15-boas-práticas-para-a-web-app)

---

## 1. Visão geral da arquitetura

O firmware é uma imagem **única** que combina:

| Camada | Origem | Função |
|--------|--------|--------|
| Motor control | ODrive v0.5.6 | FOC, encoder, NVM, estados do eixo |
| FFB / HID | OpenFFBoard (port slim) | Efeitos PID, HID wheel, EEPROM FFB |
| Ponte | `odrive_bridge.cpp` | Torque setpoint, telemetria VBUS/IBUS |
| Parser dual | `ascii_protocol.cpp` + `cmdparser.c` | Um CDC serial, dois protocolos |

```
┌─────────────────────────────────────────────────────────────┐
│  Web App (React)                                            │
│  SerialService ──► Web Serial CDC @ 115200                  │
│  HidFfbService ──► WebHID (independente do serial)        │
└───────────────────────────┬─────────────────────────────────┘
                            │ USB
┌───────────────────────────▼─────────────────────────────────┐
│  ascii_protocol.cpp::process_line()                         │
│    ├─ linha com '.' + ?/=/!  → cmdparser.c (OpenFFBoard)    │
│    └─ caso contrário         → ODrive ASCII (r/w/ss/…)      │
├─────────────────────────────────────────────────────────────┤
│  ffb_task @ 1 kHz                                           │
│    HidFFB → EffectsCalculator → odrive_bridge_set_torque()  │
│    gpio_inputs → relatório HID                              │
├─────────────────────────────────────────────────────────────┤
│  ODrive MotorControl (axis0)                                  │
│    encoder → controller (TORQUE mode) → motor               │
└─────────────────────────────────────────────────────────────┘
```

**Implicação para a web app:** configuração e diagnóstico via **serial**; teste de efeitos FFB via **WebHID** em paralelo.

---

## 2. Transporte USB

| Interface | Uso na web | Firmware |
|-----------|------------|----------|
| **CDC Serial** | Config, calibração, telemetria, save | `ascii_protocol.cpp`, `cmdparser.c` |
| **HID FFB** | `FfbTestPage`, testes de efeito | `HidFFB.cpp`, `usb_hid_2ffb_desc.c` |

**Serial (web):** `SerialService.ts` — 115200 baud, fila única de comandos, `\n` como terminador, respostas em FIFO.

**HID (web):** Vendor `0x1209`, Product `0x0d40` (`HidFfbService.ts`).

---

## 3. Protocolo serial duplo

### 3.1 Deteção de protocolo

Em `ascii_protocol.cpp::process_line()`:

- Se a linha contém **`.`** e um de **`?` `=` `!`** → **OpenFFBoard**
- Caso contrário → **ODrive ASCII**

> Nota: `;` é separador de comandos OpenFFBoard, mas comentário ODrive apenas quando **não** é linha OpenFFBoard.

### 3.2 OpenFFBoard — host → firmware

```
class[.instance].cmd[?|=|!][value]
```

| Sufixo | Significado |
|--------|-------------|
| `?` ou ausente | GET |
| `=` | SET |
| `!` | EXEC (ação) |

Vários comandos na mesma linha: separados por `;`.

**Exemplos:**
```
axis.maxtorque?
axis.maxtorque=8.5
axis.zeroenc!
gpio.2.mode=2;gpio.2.idx=0
```

### 3.3 OpenFFBoard — firmware → host

```
[class[.instance].cmdType|reply]\n
```

| Reply | Significado |
|-------|-------------|
| valor numérico/string | Sucesso GET/SET |
| `OK` | Sucesso EXEC |
| `ERR` | Handler falhou |
| `NOT_FOUND` | Comando não registado |

**Parsing na web:** `normalizeReply()` remove `[…|value]` e mapeia `True`/`False`. **`0`/`1` só viram bool quando `field.type === 'bool'`** — enums/ints (ex.: `gpio.N.mode`) conservam `0`/`1`. Sem o campo, `0`/`1` ficam dígitos.

**FIFO:** cada linha RX casa com o comando pendente mais antigo. Timeout rejeita **só** esse comando e emite `desync` — não aborta a fila inteira. Writes ODrive (`w`) esperam ~80 ms por uma linha `error`; linhas não-erro nesse intervalo são unsolicited (log), não ACK.

### 3.4 ODrive ASCII

| Comando | Função | Resposta |
|---------|--------|----------|
| `r <path>` | Ler propriedade Fibre | Valor (decimal ou `True`/`False`) |
| `w <path> <val>` | Escrever propriedade | **Silencioso** em sucesso |
| `ss` | Gravar NVM + reboot | — |
| `se` | Apagar NVM | Confirmação |
| `sr` | Soft reboot | — |
| `sd` | Entrar DFU | — |
| `sc` | Limpar erros latched | — |
| `p` `v` `c` `t` `f` | Controlo em tempo real | (não usados pela web app) |
| `i` | Dump info dispositivo | Texto multi-linha |
| `h` | Ajuda ODrive | Texto |

**Paths:** qualquer propriedade documentada em `odrive-interface.yaml` no firmware upstream (ODrive v0.5.6 embebido).

**Web:** `readCommandFor` → `r path`; `writeCommandFor` → `w path value`; bool ODrive como `1`/`0`.

---

## 4. OpenFFBoard — sintaxe e classes

Implementação: `Odrive-Wheel/src/cmd_table.cpp` + `cmdparser.c`.

Registo estático em `cmdtable[]` — **sem** registo dinâmico. Meta-comandos (`id?`, `name?`, `help?`, `cmdinfo?`, `instance?`) sintetizados em `cmdparser.c` a partir de `cmdclasses[]`.

### 4.1 Classes registadas

| Classe | CLSID | Instância | Nome display |
|--------|-------|-----------|--------------|
| `main` | 1 | 0 | FFB Wheel |
| `sys` | — | 0 | System |
| `odrv` | 133 | 0 | ODrive (M0) |
| `axis` | 2561 | 0 | Axis 0 |
| `fx` / `effects` | 2562 | 0 | Effects |
| `gpio` | — | 1–4, **6** | GPIO N |

**GPIO:** sintaxe `gpio.N.campo` onde **N = 1, 2, 3, 4 ou 6** (GPIO 5 não existe na MKS XDrive Mini). GPIO 6 = PB2 digital (sem ADC).

---

### 4.2 `main.*` — handshake Configurator

| Comando | GET | SET | EXEC | Descrição |
|---------|-----|-----|------|-----------|
| `main.id` | ✓ | | | Retorna `1` (CLSID FFB Wheel) |
| `main.hidrate` | ✓ | ✓* | | Sempre `1000` (stub) |
| `main.cfrate` | ✓ | ✓* | | Sempre `1000` (stub) |
| `main.ffbactive` | ✓ | | | Flag FFB activo (`ffb_diag_ffb_active_flag`) |
| `main.hidsendspd` | ✓ | ✓ | ✓ | Taxa HID (enum stub) |
| `main.errors` | ✓ | | | Sempre `0` |
| `main.lsbtn`, `main.btntypes`, `main.lsain`, `main.aintypes` | ✓ | ✓ | | Stubs vazios |

\* SET aceite mas valor fixo.

---

### 4.3 `sys.*` — sistema e EEPROM FFB

| Comando | GET | SET | EXEC | Handler / notas |
|---------|-----|-----|------|-----------------|
| `sys.lsmain` | ✓ | | | `"1:1:FFB Wheel (1 Axis)"` |
| `sys.lsactive` | ✓ | | | Lista classes activas |
| `sys.swver` | ✓ | | | SemVer (ex. `"1.0.0-dev"`, `>= 1.0.0`) |
| `sys.hwtype` | ✓ | | | `"ODrive-Wheel"` |
| `sys.heap` / `sys.heapfree` | ✓ | | | FreeRTOS heap livre |
| `sys.uid` | ✓ | | | UID STM32 96-bit hex |
| `sys.devid` | ✓ | | | Device ID + revision |
| `sys.main` | ✓ | ✓* | | Mainclass ID (`1`) |
| `sys.vint` | ✓ | | | VBUS mV (`odrive_bridge_get_vbus`) |
| `sys.vext` | ✓ | | | Sempre `0` |
| `sys.vbusdiv` | ✓ | ✓ | | Divisor ADC VBUS 1–50 (default **19** MKS) |
| `sys.save` | ✓ | | ✓ | **`ffb_save_flash()`** → `OK`/`FAIL` |
| `sys.savestat` | ✓ | | | `writes=N errors=N` |
| `sys.eetest` | ✓ | | ✓ | Teste round-trip EEPROM |
| `sys.eedump` | ✓ | | | Dump estado pages EE |
| `sys.eeformat` | ✓ | | ✓ | Formato forçado EE (escape hatch) |
| `sys.errors` | ✓ | | | Sempre `0` |
| `sys.errorsclr` | | | ✓ | `OK` |
| `sys.reboot` | | | ✓ | Stub `OK` (não reboota — use `sr`) |
| `sys.uptime` | ✓ | | | `HAL_GetTick()` ms |
| `sys.ping` | ✓ | | | `pong` |
| `sys.encraw` | ✓ | | ✓ | Snapshot de integridade SPI: `ok=N pty=N ef=N xfr=N last=HEX pos=N` |
| `sys.magnet` | ✓ | | ✓ | Diagnóstico do sensor AS5047 (DIAAGC) |
| `sys.mtstatus` | ✓ | | ✓ | Status MT6835: `boot=N hyst0=N overspeed=N weakfield=N undervolt=N cal=STATE` |
| `sys.mtzero` | | | ✓ | Define zero na RAM do MT6835 (`OK` ou `FAIL` se armado) |
| `sys.mteeprom` | | | ✓ | Grava na EEPROM do chip MT6835 (pausa 6.5s, não desligar por 6s) |
| `sys.mtread` | | ✓ | | Lê registro hex do MT6835 (`sys.mtread=0x011`) |
| `sys.mtwrite` | | ✓ | | Escreve registro hex do MT6835 (`sys.mtwrite=0x011 0x03`) |
| `sys.temp` | ✓ | | | Temperatura real dos MOSFETs / gate driver em °C |
| `sys.motortemp` | ✓ | | | Temperatura do motor via termistor NTC em °C |
| `sys.format`, `sys.flashdump` | ✓ | | ✓ | Stubs |
| `sys.signature`, `sys.debug` | ✓ | | | Stubs |

**Web:** `sys.save!` em `unifiedSave.ts` e `fieldApply.ts` (auto após campos FFB).

---

### 4.4 `axis.*` — parâmetros do volante FFB

| Comando | GET | SET | EXEC | Unidade / range | Persiste EE |
|---------|-----|-----|------|-----------------|-------------|
| `axis.range` | ✓ | ✓ | | graus (ex. 900) | ✓ |
| `axis.maxtorque` | ✓ | ✓ | | Nm | ✓ |
| `axis.fxratio` | ✓ | ✓ | | 0.0–1.0 | ✓ |
| `axis.invert` | ✓ | ✓ | | 0/1 (posição / HID IN) | ✓ (bit 0 `ADR_AXIS1_CONFIG`) |
| `axis.ffbinvert` | ✓ | ✓ | | 0/1 (força FFB / HID OUT) | ✓ (bit 1 `ADR_AXIS1_CONFIG`) |
| `axis.idlespring` | ✓ | ✓ | | 0–255 | ✓ |
| `axis.axisdamper` | ✓ | ✓ | | 0–255 | ✓ |
| `axis.axisinertia` | ✓ | ✓ | | 0–255 | ✓ |
| `axis.axisfriction` | ✓ | ✓ | | 0–255 | ✓ |
| `axis.esgain` | ✓ | ✓ | | 0–255 end-stop spring | ✓ |
| `axis.esdamp` | ✓ | ✓ | | 0–255 end-stop damper | ✓ |
| `axis.maxtorquerate` | ✓ | ✓ | | slew limit (0=off) | ✓ |
| `axis.expo` | ✓ | ✓ | | −32767..32767 | ✓ |
| `axis.exposcale` | ✓ | ✓ | | 1–255 | ✓ |
| `axis.zeroenc` | ✓ | | ✓ | Captura centro FFB (RAM) | ✓ após `sys.save!` |
| `axis.anticogcal` | | | ✓ | Inicia anticogging ODrive | — |
| `axis.drvtype` | ✓ | ✓ | ✓ | Stub `"5:ODrive (M0)"` | — |
| `axis.enctype` | ✓ | ✓ | ✓ | Stub `"1:ODrive Internal"` | — |
| `axis.pos` | ✓ | | | Posição graus | — |
| `axis.curtorque` | ✓ | | | Torque atual (-32767 a +32767) | — |
| `axis.curpos` | ✓ | | | Posição graus (PLL filtrada, respeita `axis.invert`) | — |
| `axis.curspd` | ✓ | | | Velocidade angular graus/s (PLL filtrada) | — |
| `axis.curaccel` | ✓ | ✓ | | Aceleração angular **graus/s²** (100 Hz LPF) | — |
| `axis.zhits` | ✓ | ✓ | | Pulsos Z aceites (N/A no AS5047/MT6835) | — |
| `axis.zglitch` | ✓ | ✓ | | IRQs Z rejeitados (N/A no AS5047/MT6835) | — |

**Naming vs OpenFFBoard upstream:** `axis.degrees` → `axis.range`; `axis.power` → `axis.maxtorque`.

**Web:** grupo `ffb-wheel` em `fieldCatalog.ts`; live poll em `axis.curpos?`, `axis.curspd?`, `axis.curtorque?`.

---

### 4.5 `fx.*` — ganhos e filtros de efeitos

| Comando | GET | SET | EXEC | Range |
|---------|-----|-----|------|-------|
| `fx.master` | ✓ | ✓ | ✓ | 0–255 (global gain) |
| `fx.spring` | ✓ | ✓ | ✓ | 0–255 |
| `fx.damper` | ✓ | ✓ | ✓ | 0–255 |
| `fx.friction` | ✓ | ✓ | ✓ | 0–255 |
| `fx.inertia` | ✓ | ✓ | ✓ | 0–255 |
| `fx.filterCfFreq` / `fx.filterCfQ` | ✓ | ✓ | ✓ | CF biquad Hz / Q×100 |
| `fx.filterFrFreq` / `fx.filterFrQ` | ✓ | ✓ | ✓ | Friction |
| `fx.filterDaFreq` / `fx.filterDaQ` | ✓ | ✓ | ✓ | Damper |
| `fx.filterInFreq` / `fx.filterInQ` | ✓ | ✓ | ✓ | Inertia |

**Defaults firmware:** spring=64, damper=64, friction=254, inertia=127, master=255.

**EXEC** em gains: lista presets (`Full:255,Half:128,None:0`).

**Web:** grupos `ffb-effects`, `ffb-filters` no separador Afinar.

---

### 4.6 `gpio.N.*` — entradas MKS (N = 1, 2, 3, 4 **e 6**)

| Campo | GET | SET | Valores |
|-------|-----|-----|---------|
| `gpio.N.mode` | ✓ | ✓ | 0=off, 1=button, 2=axis (1–4 only), 3=zerowheel |
| `gpio.N.idx` | ✓ | ✓ | Botão 0–63; eixo 0–3 |
| `gpio.N.invert` | ✓ | ✓ | 0/1 |
| `gpio.N.amin` | ✓ | ✓ | 0–4095 (só GPIO 1–4, mode=axis) |
| `gpio.N.amax` | ✓ | ✓ | 0–4095 (só GPIO 1–4) |
| `gpio.N.cur` | ✓ | | Raw ADC 0–4095, digital 0/1, ou 65535=off |
| `gpio.N.filt` | ✓ | | ADC filtrado (só GPIO 1–4; 65535 = N/A) |

**Pinout:** GPIO1–4 = PA0–PA3 (ADC); GPIO 6 = **PB2 digital only** (sem analog, sem amin/amax/filt). Modo axis só em 1–4.

**Modo 3:** borda chama `ffb_axis_zeroenc()` — RAM até `sys.save!`.

**Web:** grupo `inputs`; poll live `gpio.N.cur?` em `useDashboardLivePoll.ts`. GPIO 6 não tem `amin`/`amax`/`filt` no catálogo.

---

### 4.7 `odrv.*` — telemetria bridge (maioria read-only)

| Comando | GET | SET | Notas |
|---------|-----|-----|-------|
| `odrv.vbus` | ✓ | | mV |
| `odrv.connected` | ✓ | | Sempre `1` |
| `odrv.canid` | ✓ | ✓ | Stub RAM (Configurator) |
| `odrv.canspd` | ✓ | ✓ | Stub RAM |
| `odrv.maxtorque` | ✓ | ✓ | Stub RAM — **não** substitui `axis.maxtorque` |

---

## 5. ODrive ASCII — propriedades e comandos

### 5.1 Schema autoritativo

Schema ODrive: `odrive-interface.yaml` no repositório [upstream](https://github.com/eagabriel/Odrive-Wheel).

A web app mantém um espelho manual em `src/features/config/fieldCatalog.ts` (~120 campos).

### 5.2 Grupos na web app

| Grupo `fieldCatalog` | Paths principais | Protocolo |
|----------------------|------------------|-----------|
| `psu` | `vbus_voltage`, `ibus`, `config.dc_bus_*`, `config.brake_resistance` | odrive |
| `axis` | `axis0.current_state`, `axis0.requested_state`, `axis0.config.startup_*` | odrive |
| `motor` | `axis0.motor.config.*`, `axis0.motor.is_calibrated` | odrive |
| `encoder` | `axis0.encoder.config.*`, `axis0.encoder.is_ready` | odrive |
| `controller` | `axis0.controller.config.*`, `axis0.controller.input_torque` | odrive |
| `motor-thermistor` | `axis0.motor.motor_thermistor.config.*` | odrive |
| `ffb-wheel` | `axis.range`, `axis.maxtorque`, … | openffboard |
| `ffb-effects` | `fx.*` gains | openffboard |
| `ffb-filters` | `fx.filter*` | openffboard |
| `inputs` | `gpio.N.*` | openffboard |
| `live` | `axis.curpos`, `axis.curspd`, `odrv.vbus` | openffboard |
| `system` | `sys.swver`, `sys.heap`, `sys.vbusdiv` | openffboard |

### 5.3 Campos só leitura (não aparecem no ConfigPage)

Filtrados por `field.readonly` em `ConfigPage.tsx`:

| Path | Motivo |
|------|--------|
| `axis0.encoder.config.phase_offset` | Resultado calibração estado 7 |
| `axis0.encoder.config.phase_offset_float` | Idem |
| `axis0.encoder.config.direction` | Calibrado automaticamente — inverter via `axis.invert` |
| `axis0.motor.config.phase_resistance/inductance` | Pós motor cal |
| `axis0.motor.is_calibrated`, `axis0.encoder.is_ready` | Status live |
| `vbus_voltage`, `ibus`, telemetria | Observação / live debug |

### 5.4 Propriedade não gravável via `w`

| Path | Alternativa |
|------|-------------|
| `axis0.controller.config.anticogging.calib_anticogging` | `axis.anticogcal!` |

### 5.5 Modos importantes para FFB

| Parâmetro | Valor FFB típico |
|-----------|------------------|
| `axis0.controller.config.control_mode` | **1** = TORQUE |
| `axis0.controller.config.input_mode` | **1** = PASSTHROUGH |
| `axis0.encoder.config.mode` | **257** = SPI ABS AMS (AS5047) ou **0** = incremental |
| `axis0.encoder.config.cpr` | **16384** (AS5047) ou **8192** (ABZ típico) |
| `axis0.encoder.config.bandwidth` | 50–2000 Hz PLL (editável, separador Motor) |
| `axis0.motor.config.current_control_bandwidth` | 50–2000 rad/s |

### 5.6 Encoder modes (`fieldCatalog`)

| Valor | Tipo |
|-------|------|
| 0 | Incremental |
| 1 | Hall |
| 257 | SPI ABS AMS (AS5047) |
| 258 | SPI ABS CUI |
| 259 | SPI ABS AEAT |
| 260 | SPI ABS RLS |

---

## 6. Estados do eixo e calibração

### 6.1 Tabela de estados ODrive

Comando: `w axis0.requested_state <N>` — sem resposta; poll `r axis0.current_state` até `1` (IDLE).

| Estado | N | Timeout web | Uso |
|--------|---|-------------|-----|
| IDLE | 1 | 5 s | Desarmar — obrigatório antes de save NVM |
| FULL_CALIBRATION | 3 | 90 s | Motor + encoder (**perigo** — volante solto) |
| MOTOR_CALIBRATION | 4 | 30 s | Medir R/L |
| ENCODER_INDEX_SEARCH | 6 | 60 s | Procurar índice Z |
| ENCODER_OFFSET_CALIBRATION | 7 | 60 s | Phase offset — **centrar volante antes** |
| CLOSED_LOOP_CONTROL | 8 | 10 s | FFB activo |
| LOCKIN_SPIN | 9 | 30 s | Lock-in sensorless |
| ENCODER_DIR_FIND | 10 | 30 s | Detectar direcção encoder |
| HOMING | 11 | 30 s | Requer endstops |

**Runner web:** `calibrationRunner.ts` — `sc` → `w requested_state` → poll → ler erros.

### 6.2 Acções FFB específicas

| Acção | Comando | Persistência |
|-------|---------|--------------|
| Centro FFB (AS5047 / uso diário) | `axis.zeroenc!` + `axis.zeroofs` | RAM; EEPROM FFB com `sys.save!` |
| Centro ODrive `index_offset` | captura mecânica (incremental + Z) | NVM ODrive (`ss`) |
| Anticogging | `axis.anticogcal!` (alias ASCII `Y`) | Mapa em ODrive NVM (`ss`) |
| Limpar erros | `sc` | — |

### 6.3 Presets de boot (web)

`calibrationBootPresets.ts`:

**`persistReady` (recomendado pós-cal + Save):**
- `pre_calibrated` motor + encoder = true
- `startup_*_calibration` = false
- `startup_closed_loop_control` = true (após cal bem-sucedida; a UI bloqueia se o encoder não estiver pronto)
- Limites velocidade FFB = false

**`autoCalEveryBoot` (legado):** re-corre calibração em cada boot.

### 6.4 Fluxo AS5047 recomendado

1. Preset encoder (mode, CPR, CS pin)
2. **Salvar** (header)
3. Motor cal (estado 4)
4. Encoder cal (estado 7)
5. Preset boot `persistReady`
6. **Salvar** novamente

Ver `calibrationIntegrity.ts` para bloqueios de combinações inválidas.

---

## 7. Registos de erro

### 7.1 Leitura

| Registo | Comando |
|---------|---------|
| Sistema | `r error` |
| Eixo 0 | `r axis0.error` |
| Motor | `r axis0.motor.error` |
| Encoder | `r axis0.encoder.error` |
| Controller | `r axis0.controller.error` |

**Limpar:** `sc`

### 7.2 Decodificação (web)

`src/features/live/errorDecoder.ts` — bitmasks portados de `odrive-wheel.html`.

Formato aceite: decimal ou `0x…`.

**Bits mais comuns em calibração:**

| Registo | Bit | Significado |
|---------|-----|-------------|
| motor | `PHASE_RESISTANCE_OUT_OF_RANGE` | Motor cal falhou |
| motor | `PHASE_INDUCTANCE_OUT_OF_RANGE` | Motor cal falhou |
| encoder | `ABS_SPI_TIMEOUT` / `ABS_SPI_COM_FAIL` | AS5047 wiring/SPI |
| encoder | `CPR_POLEPAIRS_MISMATCH` | CPR errado |
| axis | `ENCODER_FAILED` | Encoder não pronto |

---

## 8. Comandos de diagnóstico FFB

Comandos **single-char** ODrive ASCII (patch em `ascii_protocol.cpp`). **Não** misturar com `d` do DFU em contextos diferentes — na prática a web envia linha isolada.

| Cmd | Formato resposta | Conteúdo |
|-----|------------------|----------|
| `d` | `ffb=%d eff=%d hout=%lu setEf=%lu` | Resumo FFB |
| `D` | `ctrl=%lu newef=%lu setef=%lu efop=%lu` | Breakdown HID OUT |
| `C` | `cond=%lu cnst=%lu prdc=%lu` | Contadores efeitos |
| `T` | `lt=%ld nm=%.4f` | Último torque HID + Nm pendente |
| `E` / `En` | `idx=… st=… t=… mag=… ax=… g=… GG=…` | Efeito activo n |
| `I` | `Ibus=min..max Mot=min..max V=min..max` | Picos corrente/tensão |
| `S` / `Sn` | slots de efeitos | Dump slots físicos |
| `R` | `peaks reset` | Reset picos `I` |
| `M` | `maxtq= fxratio= range= eff=Nm` | Params eixo (alt. a `axis.*`) |

**Web:** `liveMonitorCatalog.ts` usa `DIAG_CMDS = ['d','D','C','T','E','I','R','M']` no Live Debug. `Y` é alias de `axis.anticogcal!` (aba Calibração). `j`/`J` lê/escreve validação do mapa anticog — sem UI neste ciclo.

**Parsing torque:** `parseTorque.ts` — preferir `lt` + `axis.maxtorque` sobre `nm=` (firmware antigo).

---

## 9. Persistência — duas memórias

```
┌──────────────────────┐   sys.save!    ┌─────────────────────────┐
│  RAM FFB / GPIO / fx │ ─────────────► │ Flash S1+S2 @ 0x08004000 │
│  axis.range, fx, …   │                │ EEPROM emulada STM32     │
└──────────────────────┘                └─────────────────────────┘

┌──────────────────────┐   ss (+reboot) ┌─────────────────────────┐
│  RAM ODrive config   │ ─────────────► │ Flash S10+S11 (NVM ODrive)│
│  motor/encoder/ctrl  │                │ stm32_nvm.c              │
└──────────────────────┘                └─────────────────────────┘
```

### 9.1 O que `sys.save!` grava (`ffb_save_flash`)

| Dados | Endereços EE (`eeprom_addresses.h`) |
|-------|-----------------------------------|
| Gains + filtros efeitos | `ADR_FFB_*` |
| `axis.range`, `maxtorque`, `fxratio` | `ADR_AXIS1_DEGREES`, `POWER`, `EFFECTS1` |
| Efeitos sempre-activos, expo, end-stop | `ADR_AXIS1_EFFECTS2`, `POSTPROCESS1`, … |
| `axis.invert` | `ADR_AXIS1_CONFIG` bit 0 |
| `zeroOffset` (pós `axis.zeroenc!`) | `ADR_AXIS1_ZEROOFS_LO/HI` |
| GPIO 1–4 e **6** config | `ADR_GPIO1_*` … `ADR_GPIO4_*`, `ADR_GPIO6_*` |
| `sys.vbusdiv` | `ADR_VBUS_DIVIDER` |
| Master gain | slot `0x04F0` |

**Diagnóstico:** `sys.savestat?`, `sys.eedump?`, `sys.eetest!`, `sys.eeformat!`

### 9.2 O que `ss` grava

Toda a config ODrive em RAM: motor, encoder, controller, PSU, flags `startup_*`, `phase_offset`, etc.

**Requer:** `w axis0.requested_state 1` antes (motor desarmado).

### 9.3 Sequência Save na web (`unifiedSave.ts`)

1. `w axis0.requested_state 1`
2. Escrever paths dirty (`writeFieldNow`)
3. `sys.save!` (FFB EEPROM)
4. `ss` (ODrive NVM + reboot)
5. Desconectar → reconectar (até 12 tentativas)
6. `readAllFields()` — hidratar UI

**Apply campo-a-campo** (`fieldApply.ts`): campos `openffboard` → write + `sys.save!` automático; campos `odrive` → só RAM até Save global.

### 9.4 Erase

| Comando | Efeito |
|---------|--------|
| `se` | Apaga NVM ODrive + EEPROM FFB no fluxo web (erase real) |
| `sys.eeformat!` | Só EEPROM FFB (emergência) |

Não existe `sys.erase!` nesta placa — o erase autoritativo é `se`. `sys.reboot!` também não reinicia (use `sr`).

---

## 10. Stack HID / FFB

### 10.1 Fluxo de torque

```
Jogo (HID OUT) → HidFFB::hidOut() → EffectsCalculator
  → soma efeitos + axis damper/friction/inertia
  → odrive_bridge_set_input_torque(Nm)
  → axes[0].controller_.input_torque_
```

**Thread:** `ffb_task.cpp` @ **1 kHz**.

### 10.2 Ficheiros firmware

| Ficheiro | Função |
|----------|--------|
| `HidFFB.cpp` | PID reports: CreateNewEffect, SetEffect, Envelope, etc. |
| `EffectsCalculator.cpp` | Pool de efeitos, ganhos, filtros biquad |
| `ffb_task.cpp` | Loop principal, diag, save, peak tracking |
| `usb_hid_2ffb_desc.c` | Descritor wheel 2-axis FFB |
| `gpio_inputs.cpp` | Botões/eixos no relatório HID |

### 10.3 Web HID (paralelo ao serial)

| Ficheiro | Função |
|----------|--------|
| `HidFfbService.ts` | WebHID, builders PID |
| `FfbTestPage.tsx` | UI teste manual |
| `perfTestHid.ts` | Benchmark |

Serial configura ganhos/filtros; HID envia efeitos em tempo real.

### 10.4 Telemetria HID 1 kHz (rc12+)

A partir do **v1.0.0-rc12**, o relatório HID **IN** (report ID `0x01`) inclui telemetria embebida a **1 kHz** (mesma task que o loop FFB). A web app faz parse em `hidInputReport.ts` e alimenta gráficos quando WebHID está conectado.

**Offsets no payload** (após report ID, little-endian int16):

| Offset | Campo | Escala |
|--------|-------|--------|
| 8 | Posição volante | `× axis.range/2 ÷ 32767` → graus |
| 10 | Velocidade | ÷ 1000 → turn/s |
| 12 | Iq | ÷ 1000 → A |
| 14–18 | RX, RY, RZ | raw HID axes |
| 20 | Torque | ÷ 1000 → Nm |
| 22 | Slider | raw |
| 24 | VBus | ÷ 100 → V |
| 26 | IBus | ÷ 100 → A |
| 28 | IBrake | ÷ 100 → A |

**Requisitos web:** HID conectado (`HidFfbService`) + `axis.range` carregado para escalar posição. Badge **HID 1 kHz** aparece no painel de telemetria quando activo; polling serial de posição/torque é omitido para evitar duplicar amostras.

---

## 11. GPIO e entradas analógicas

Ver `gpio_inputs.h` para pinout e modos.

**Instâncias:** 1, 2, 3, 4 e **6** (5 inválido). GPIO 1–4 = PA0–PA3 ADC; **GPIO 6 = PB2 digital only** (firmware rejeita modo analog).

**Modo 3 (zerowheel):** flanco high→low chama `ffb_axis_zeroenc()` — equivalente a `axis.zeroenc!`, **sem** persistir até `sys.save!`.

### 11.1 Processador analógico global (rc12)

| Comando | Tipo | Descrição |
|---------|------|-----------|
| `axis.gpiofilt` | bool | Filtro Biquad global nos GPIOs modo eixo |
| `axis.gpiofiltf` | float | Cutoff Hz (0.5–500, default **60**) |
| `axis.gpioautocal` | bool | Autocal min/max → escreve `gpio.N.amin/amax` |
| `gpio.N.filt?` | readonly | Valor ADC filtrado ao vivo |

Persistência: flags + freq×10 em EEPROM FFB layout **v0x0003** (`ADR_GPIO_AXIS_FLAGS`, `ADR_GPIO_AXIS_FREQ_X10`).

**Web:** secção «Suavização» em cada card GPIO em modo eixo (`AnalogSignalTuning`); barras raw+filtrado em `InputChannelPanel`.

### 11.2 Offset virtual de zero

| Comando | Descrição |
|---------|-----------|
| `axis.zeroofs` | Offset persistente em graus (GET/SET). `0` desfaz centro software. Persiste via `sys.save!`. |

**Leitura live:** `gpio.N.cur?` → 0–4095 (axis) ou 0/1 (button).

**Web:** `InputsWorkspace.tsx`, `analogAxisMath.ts` (`parseReplyNumber`, `toLinearPercent`).

---

## 12. Bridge ODrive (`odrive_bridge`)

API C em `odrive_bridge.h` — isola `odrive_main.h` do código FFB.

| Função | Uso |
|--------|-----|
| `odrive_bridge_init()` | Arranca quadrature decoder |
| `odrive_bridge_set_input_torque(nm)` | Setpoint FFB |
| `odrive_bridge_get_pos_turns()` | Posição encoder |
| `odrive_bridge_get_vbus()` | Tensão bus |
| `odrive_bridge_get_ibus()` | Corrente bus |
| `odrive_bridge_get_motor_ibus()` | Corrente motor |
| `odrive_bridge_motor_is_armed()` | Motor armado |
| `odrive_bridge_start_anticogcal()` | `axis.anticogcal!` |

Comandos `odrv.vbus`, `sys.vint`, telemetria live usam estas funções.

### 12.1 Diagnóstico AS5047 (rc12)

| Comando | Resposta | Uso |
|---------|----------|-----|
| `sys.encraw!` | `ok=… pty=… ef=… xfr=… last=… pos=…` | Contadores SPI + último raw |
| `sys.magnet!` | `agc=… magl=… magh=… cof=… lf=… updates=… status=…` | Registo DIAAGC (distância íman) |

**Web:** `As5047DiagnosticsPanel`, `as5047Diagnostics.ts`, comandos em `commandRegistry.ts`.

---

## 13. Mapa firmware → web app

### 13.1 Camada de protocolo

| Firmware | Web |
|----------|-----|
| `ascii_protocol.cpp` | `SerialService.ts` |
| `cmdparser.c` | `BoardProtocol.ts` (`normalizeReply`) |
| `cmd_table.cpp` | `fieldCatalog.ts` (paths openffboard) |
| `odrive-interface.yaml` | `fieldCatalog.ts` (paths odrive) |

### 13.2 Funcionalidades por separador

| Separador web | Grupos refresh | Firmware usado |
|---------------|----------------|----------------|
| Dashboard | system, live, psu, axis, inputs | `axis.curpos?`, `T`, estados |
| Setup | psu…ffb-wheel | Wizard + cal |
| Calibração | psu…live | `w requested_state`, `sc` |
| Motor | psu…controller | `r`/`w` ODrive |
| Afinar | ffb-* | `axis.*`, `fx.*` |
| Entradas | inputs | `gpio.N.*` |
| Observar | system, live | Telemetria + `liveMonitorCatalog` |
| Comandos | — | `commandRegistry.ts` |
| Manutenção | system | `ss`, `se`, `sr`, `sd` |

### 13.3 Política de refresh (`refreshPolicy.ts`)

- `initialFieldsForTab` — todos os campos do grupo ao mudar de tab
- `refreshFieldsForTab` — subset `highSignalPaths` (máx. 16) no botão ↻
- Campos dirty **não** são sobrescritos no refresh

### 13.4 Comandos registados (`commandRegistry.ts`)

Ver secção 6 + 9; lista completa em `src/domain/commands/commandRegistry.ts`.

---

## 14. Ficheiros-fonte por tema

### Firmware Odrive-Wheel (repositório upstream)

| Tema | Localização no upstream |
|------|-------------------------|
| Parser OpenFFBoard | `inc/cmdparser.h`, `src/cmdparser.c`, `src/cmd_table.cpp` |
| Router serial | ODrive v0.5.6 embebido — `Firmware/communication/ascii_protocol.cpp` |
| FFB core | `src/ffb_task.cpp`, `src/HidFFB.cpp`, `src/EffectsCalculator.cpp` |
| EEPROM FFB | `src/eeprom.c`, `inc/eeprom_addresses.h` |
| GPIO | `src/gpio_inputs.cpp`, `src/gpio_axis_proc.cpp` |
| Bridge | `src/odrive_bridge.cpp` |

Repositório: [github.com/eagabriel/Odrive-Wheel](https://github.com/eagabriel/Odrive-Wheel)

### Web app (este repositório)

| Tema | Ficheiros |
|------|-----------|
| Schema campos | `src/features/config/fieldCatalog.ts` |
| Protocolo | `src/features/board/BoardProtocol.ts` |
| Serial | `src/features/serial/SerialService.ts` |
| Save | `src/features/board/unifiedSave.ts`, `useBoardSave.ts`, `fieldApply.ts` |
| Calibração | `src/features/calibration/*` |
| Live debug | `src/features/live/liveMonitorCatalog.ts`, `errorDecoder.ts` |
| Telemetria | `src/features/telemetry/*` |
| HID | `src/features/hid/*` |
| Comandos | `src/domain/commands/commandRegistry.ts` |
| Refresh | `src/app/refreshPolicy.ts` |

---

## 15. Boas práticas para a web app

### 15.1 Fila serial

- **Um comando de cada vez** — `SerialService` enfileira tudo.
- Polling agressivo em Observação + telemetria + live debug compete pela fila — usar `holdPolling` e intervalos ≥ 500 ms–1 s.
- Timeout de um comando **não** deve `flush` de toda a fila; a UI mostra `desync`.
- Writes ODrive: janela de ~80 ms para `error`; silêncio = sucesso. Uma linha numérica nesse intervalo **não** é ACK.

### 15.2 Writes ODrive

- `w` não devolve ACK — confirmar com `r` readback (`applyField`).
- Erros aparecem como linha de texto na serial.

### 15.3 Duas memórias

- Alterar `axis.maxtorque` → `sys.save!` (ou apply auto).
- Alterar `axis0.motor.config.current_lim` → **Salvar** header (`ss`).
- `phase_offset` só muda com cal estado 7 + `ss` — **nunca** `w` manual.

### 15.4 Modo TORQUE (FFB)

Campos controller marcados **inert** em `fieldEditState.ts` quando `control_mode=1` — não afectam FFB.

Manter `enable_vel_limit`, `enable_overspeed_error`, `enable_torque_mode_vel_limit` = **false** para FFB direct drive.

### 15.5 Adicionar novo campo à web

1. Confirmar path no firmware (`cmd_table` ou `odrive-interface.yaml`).
2. Entrada em `fieldCatalog.ts` com `protocol` correcto.
3. Traduções em `i18n/bundles/fields.ts` e `guidance.ts`.
4. Se live: `liveMonitorCatalog.ts`.
5. Se alto sinal: `refreshPolicy.ts` → `highSignalPaths`.
6. Correr `bun run firmware:check` (compara `cmd_table.cpp` com catálogo + commandRegistry).
7. Testar read, write, save (FFB vs ODrive).

### 15.6 Referência legado

O configurador HTML monolítico (`tools/odrive-wheel.html` no repositório upstream) continua a ser referência de comportamento para portes React; bitmasks de erro e SCHEMA embutido.

---

## Apêndice A — Resposta OpenFFBoard (exemplos)

```
TX: axis.maxtorque?
RX: [axis.maxtorque?|8.50]

TX: axis.maxtorque=8.5
RX: [axis.maxtorque=|8.50]

TX: axis.zeroenc!
RX: [axis.zeroenc!|OK]

TX: sys.save!
RX: [sys.save!|OK]
```

## Apêndice B — Resposta ODrive (exemplos)

```
TX: r axis0.current_state
RX: 1

TX: w axis0.requested_state 8
RX: (silêncio)

TX: r axis0.motor.config.current_lim
RX: 10.0

TX: sc
RX: (silêncio)
```

## Apêndice C — Layout EEPROM FFB (resumo)

Ver `Odrive-Wheel/inc/eeprom_addresses.h` — versão layout `EE_LAYOUT_VERSION = 0x0002` (S1+S2, isolado da NVM ODrive em S10+S11).

---

*Documento gerado para o repositório Odrive-Wheel. Actualizar quando `cmd_table.cpp` ou `fieldCatalog.ts` mudarem.*
