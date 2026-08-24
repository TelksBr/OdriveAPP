export const guidanceEn: Record<string, string> = {
  // PSU / Brake
  'config.dc_bus_overvoltage_trip_level':
    'Set 2–4 V above your PSU nominal voltage. For a 48 V supply: 52–54 V is safe. Too low = false trips during motor acceleration; too high = risk of capacitor and FET damage during regen. Decrease ramp_end to stay below this value.',
  'config.dc_bus_undervoltage_trip_level':
    'Set slightly below your minimum supply voltage. For 10S LiPo: ~34 V. For a 48 V lab supply: ~40 V. Too low = over-discharging batteries silently; too high = nuisance trips on small PSU sag.',
  'config.brake_resistance':
    'Must exactly match the physical resistor value (measure with a multimeter). Mismatch makes power calculations wrong and may leave regen energy undissipated. Common values: 0.5 Ω, 2 Ω, 8 Ω. No resistor installed = set enable_brake_resistor to false.',
  'config.enable_brake_resistor':
    'Enable when a physical brake resistor is wired. Without it, regen energy charges the DC bus until the overvoltage trip fires — causing brief motor cut-outs during heavy FFB braking. Essential for sustained sim-racing sessions.',
  'config.dc_bus_overvoltage_ramp_start':
    'Voltage where the brake resistor duty-cycle starts increasing. Must be ≤ ramp_end and < overvoltage_trip_level. A typical arrangement: nominal 48 V → ramp_start 50 V → ramp_end 52 V → trip 54 V.',
  'config.dc_bus_overvoltage_ramp_end':
    'Voltage where the brake resistor reaches 100 % duty. Set ramp_end = trip_level − 1 V so full braking engages just before the trip fires.',
  'config.dc_max_positive_current':
    'Caps current drawn from the PSU. Set to your PSU rated current or motor safe limit, whichever is lower. Exceeding PSU rating causes voltage sag and PSU shutdown.',
  'config.dc_max_negative_current':
    'Limits regen current pushed back into the PSU. Keep negative (e.g. −5). For non-regen lab supplies set to −0.1 to prevent backfeed damage. For LiPo packs that support charging set to match the charger C-rate.',

  // Axis
  'axis0.current_state':
    'Live axis state — poll with r axis0.current_state. 8 = closed-loop (FFB active), 1 = IDLE (no torque). This is the field to watch during operation; requested_state often reads 0 after a command completes.',
  'axis0.requested_state':
    'Write-only command (w axis0.requested_state N). ODrive clears this to 0 once the transition finishes — seeing 0 while current_state is 8 is normal. Key values: 1 = IDLE (safe), 3 = full calibration (motor spins — hold wheel!), 8 = closed-loop. Never send 3 with wheel mounted.',
  'axis0.config.startup_closed_loop_control':
    'When true, ODrive enters closed-loop automatically after boot — no need to send state=8 each time. Only enable after motor and encoder are pre_calibrated. Combine with pre_calibrated flags for a fully autonomous startup.',
  'axis0.config.startup_motor_calibration':
    'Runs R/L motor calibration on every boot when true. After a successful cal + Save, set false and enable motor pre_calibrated instead.',
  'axis0.config.startup_encoder_offset_calibration':
    'Runs encoder offset calibration on every boot when true. After success + Save, set false and enable encoder pre_calibrated.',
  'axis0.config.startup_encoder_index_search':
    'Searches encoder Z index on boot. Only for incremental encoders with index wired. Disable after index is found and saved.',
  'config.max_regen_current':
    'Caps regen current into the DC bus (separate from dc_max_negative_current). Set 0 for PSUs that cannot accept backfeed.',

  // Motor
  'axis0.motor.config.current_lim':
    '⚠ Safety-critical. Higher current = more torque = more heat. Set at or below the motor\'s rated continuous current. Exceeding this overheats windings and ODrive FETs. Formula: current_lim = desired_max_torque_Nm / torque_constant. Typical FFB range: 8–20 A.',
  'axis0.motor.config.motor_type':
    'Must match physical motor construction. High-current BLDC (0) for most wheel motors. Gimbal (2) for low-speed, high-inductance motors (rare in FFB). Wrong type = failed calibration or erratic behavior.',
  'axis0.motor.config.pole_pairs':
    '⚠ Must be exact. Count the rotor magnets and divide by 2. Example: 14 magnets = 7 pairs. Wrong value causes failed calibration, jerky movement, or axis errors. Check the motor datasheet or count magnets physically.',
  'axis0.motor.config.calibration_current':
    'Current applied during the resistance/inductance calibration sequence. Should be 20–30 % of current_lim. Too low = calibration fails or returns inaccurate R/L values. Too high = motor jerks violently during calibration.',
  'axis0.motor.config.resistance_calib_max_voltage':
    'Voltage ceiling during phase-resistance measurement. Default 4 V is fine for most motors. Raise to 6–8 V if calibration consistently fails with "phase resistance out of range" — high-resistance motors need more voltage to drive the calibration current.',
  'axis0.motor.config.torque_constant':
    '⚠ Critical for torque accuracy. Kt = rated_torque_Nm / rated_current_A. Alternative: Kt ≈ 8.27 / motor_kv. Wrong Kt makes axis.maxtorque meaningless — the wheel will be too weak or saturate motor current. Always verify with the motor datasheet.',
  'axis0.motor.config.current_control_bandwidth':
    'Current loop bandwidth in rad/s. Higher = faster torque response = crisper FFB feel. Too high = oscillation and noise. Start at 100, increase in steps of 50, watch for audible ringing. Beyond 1000 requires good motor wiring and low inductance.',
  'axis0.motor.config.current_control_deadband':
    'Suppresses low-level noise in the current PI loop. 0 = sharpest response (recommended for FFB). Increase to 0.02–0.05 if motor produces an audible hum or buzz when idle without game input.',
  'axis0.motor.config.pre_calibrated':
    'Skip motor calibration on boot. Only set true after a successful calibration where measured R/L values are plausible. Combine with encoder.pre_calibrated and startup_closed_loop_control for a fully silent auto-start.',
  'axis0.motor.config.requested_current_range':
    'Current sense ADC range in amps. Set slightly above current_lim (e.g. current_lim + 2 A). Too low = current clipping; too high = reduced resolution.',

  // Encoder
  'axis0.encoder.config.mode':
    'Incremental (0) for standard quadrature A/B encoders — most common. Hall (1) for 3-wire hall-effect feedback (lower precision). SPI variants for absolute encoders that avoid Z-pulse search on startup.',
  'axis0.encoder.config.cpr':
    '⚠ Must exactly match encoder specs. CPR = counts per revolution (typically 4× lines-per-revolution for quadrature). Example: 2048 LPR encoder × 4 = 8192 CPR. Wrong CPR: ODrive misreads speed and position, destabilizing the current loop.',
  'axis0.encoder.config.bandwidth':
    'PLL estimator bandwidth in Hz. Higher = faster velocity/position estimate = better FFB feel. Default 1000 Hz is good. Reduce to 200–500 if encoder signal is noisy (long cable, no shielding). Too high with noisy signal = oscillation.',
  'axis0.encoder.config.use_index':
    'Enable when the encoder has a Z (index) pulse wired and you want sub-revolution homing. ODrive will search for the Z pulse on startup before entering closed-loop. Without Z, encoder offset is arbitrary but still valid after calibration.',
  'axis0.encoder.config.pre_calibrated':
    'Skip encoder offset calibration on boot. Only valid after at least one successful calibration cycle. With use_index=true, this also skips the index search — requires the index to be reliably found beforehand.',
  'axis0.encoder.config.direction':
    'READONLY calibration result (1 or −1). The firmware sets this during motor/encoder calibration — manual writes can invert the Park transform and cause oscillation or disarm. To flip wheel direction for the user/game, use axis.invert on the FFB Wheel tab. To auto-detect, run axis state 10 (encoder dir find) on the Calibration tab.',
  'axis0.encoder.config.abs_spi_cs_gpio_pin':
    'Chip-select GPIO for SPI absolute encoders. MKS XDrive Mini default for AS5047: pin 7. Must match your wiring.',

  // Controller
  'axis0.controller.config.control_mode':
    '⚠ Must be Torque (1) for FFB operation. Voltage mode ignores the current loop entirely. Velocity/position modes are incompatible with direct torque commands from the FFB stack.',
  'axis0.controller.config.input_mode':
    '⚠ Must be Passthrough (1) for FFB. Passthrough routes input_torque directly to the current loop with no internal filtering, giving the lowest possible latency. Ramp modes add lag that degrades FFB feel.',
  'axis0.controller.config.vel_limit':
    'Velocity limit in turns/second. Only active when enable_vel_limit=true. For FFB typically left disabled. If you use it as a safety brake, set 5–20 turns/s depending on your wheel range.',
  'axis0.controller.config.enable_vel_limit':
    'Leave FALSE for FFB. Enabling causes ODrive to suppress torque command when wheel spins above vel_limit, which fights against strong game forces and creates a mushy top-speed feeling.',
  'axis0.controller.config.enable_overspeed_error':
    'Leave FALSE for FFB. Enabling trips the axis into error when wheel velocity briefly exceeds vel_limit — common during snappy FFB events — freezing the motor unexpectedly.',
  'axis0.controller.config.enable_torque_mode_vel_limit':
    '⚠ Must be FALSE for FFB. When true, ODrive injects a damping term to slow the axis down when vel_limit is exceeded, creating strong opposing forces that fight game FFB.',

  // FFB Wheel
  'axis.range':
    'Wheel lock-to-lock angle in degrees. Must match the game/simulator steering lock setting for 1:1 physical-to-virtual ratio. Common values: 540° (rally/default in many sims), 900° (most sim-racing sims), 1080° (GT cars). Mismatch = wheel hits virtual lock before/after physical lock.',
  'axis.maxtorque':
    '⚠ Torque ceiling. HID full-scale (32767) maps to this value in Nm. Formula: axis.maxtorque = current_lim × torque_constant × axis.fxratio. Exceeding motor current capability causes thermal protection trips. Too low = weak FFB. The TorqueCapAdvisor calculator above shows the safe budget.',
  'axis.fxratio':
    'Global FFB attenuation factor (0.0–1.0) applied after effects calculation but before ODrive. 1.0 = full torque. Use to globally reduce peak forces without changing motor current limits. Useful for endurance sessions or weaker arms. 0.75 is a common starting point.',
  'axis.invert':
    'Inverts wheel axis position / visual direction (HID IN). Enable if turning right turns left in the game or app telemetry. Independent of FFB force inversion.',
  'axis.ffbinvert':
    'Inverts FFB force direction (HID OUT). Enable if FFB pulls in the opposite direction (e.g. into the wall during a turn). Independent of wheel position inversion.',
  'axis.idlespring':
    'Centering spring active when no game is sending effects (paused, on menus, before race start). 0 = wheel falls freely, 10–20 = gentle return-to-center, 50+ = strong self-centering. Prevents wheel from drooping to one side while idle.',
  'axis.axisdamper':
    'Always-active velocity-proportional resistance, independent of game effects. Simulates hydraulic damping or a heavy steering column. 0 = no effect. Values 8–20 add a subtle steering weight; 50+ creates a heavy, slow feel. Does not depend on game support.',
  'axis.axisinertia':
    'Always-active acceleration resistance, simulating a physical flywheel. 0 = no effect. Values 5–20 add realistic inertia without killing responsiveness. Too high makes the wheel sluggish to turn. Does not depend on game support.',
  'axis.axisfriction':
    'Always-active constant friction (stiction) applied at all speeds. 0 = off. Use sparingly — high values mask fine FFB textures from the game and make center feel gummy. Values 5–15 add mechanical feel without hurting detail.',
  'axis.esgain':
    'Electronic end-stop spring strength triggered when wheel exceeds axis.range. 0 = wheel can spin freely past the software limit (dangerous — wheel may hit physical stop at speed). 30–80 = firm wall. 150+ = very hard limit. Set high enough to reliably stop the wheel at virtual lock.',
  'axis.esdamp':
    'Damping at the electronic end-stop to absorb bounce when wheel hits the virtual lock. Increase if wheel oscillates or bounces off the end-stop. Values 20–60 usually eliminate bounce without making the end-stop feel spongy.',
  'axis.maxtorquerate':
    'Torque slew rate limiter (max Nm/ms in internal counts). 0 = disabled, sharpest possible response. Low values (2–6) smooth abrupt force transitions, reducing mechanical shock. Too high over-filters game effects and adds perceived latency. Start at 0 for raw feel, then add sparingly.',
  'axis.expo':
    'Non-linear position curve applied to the HID axis output. 0 = linear (standard). Positive = more sensitive near center, less toward lock (racing preference). Negative = dead zone near center, more sensitivity at extremes. Does not affect FFB forces, only the reported steering position.',
  'axis.exposcale':
    'Divisor that controls the strength of the expo curve. Higher value = gentler expo effect. Set to 1 for maximum expo at the configured axis.expo value. Increase to soften the curve progressively.',

  // FFB Effects
  'fx.master':
    'Global gain applied to ALL effects before axis.fxratio. 255 = 100 % (no attenuation). 128 = 50 %. Reduce if all game effects are too strong without wanting to change individual effect levels. Multiplicative with axis.fxratio: effective output = master/255 × fxratio × axis.maxtorque.',
  'fx.spring':
    'Gain for spring condition effects from games (lane-keeping, centering, spring force type). 255 = game full-scale. Lower if springs feel too tight. 0 = disables all spring condition effects while preserving constant force and others.',
  'fx.damper':
    'Gain for damper condition effects from games (velocity-proportional resistance). High values = heavy, slow steering. Low values = lively, responsive. Common range 80–180. Setting 0 disables damper conditions — useful to isolate constant force feedback.',
  'fx.friction':
    'Gain for friction condition effects from games (speed-independent resistance). Too high masks road texture and bumps. Common range 50–150. Set 0 to disable friction conditions and hear only the raw road/bump detail.',
  'fx.inertia':
    'Gain for inertia condition effects from games (mass simulation). 255 = heavy wheel, hard to accelerate. Low values = light, quick response. Most drivers prefer 50–150. Set 0 to disable inertia conditions.',

  // GPIO fallbacks
  'gpio.mode':
    'GPIO 1–4 = PA0–PA3 (ADC): 0 off, 1 HID button 0–63, 2 HID axis Rx/Ry/Rz/Slider, 3 zero-wheel (axis.zeroenc in RAM until sys.save!). GPIO 6 = PB2 digital-only — no analog mode, no amin/amax/filt.',
  'gpio.idx':
    'HID report index. Button 0–63. Analog axis 0–3 (Rx/Ry/Rz/Slider) on GPIO 1–4 mode 2 only. GPIO 6 is button bits only.',
  'gpio.invert':
    'Mirrors the input. Buttons: pressed = 0 instead of 1. Analog: mapped range reversed. Persists with sys.save! (FFB EEPROM S1+S2).',
  'gpio.amin':
    'Raw ADC at mechanical minimum (GPIO 1–4 analog mode). Read gpio.N.cur at the stop and enter that value. Not present on GPIO 6.',
  'gpio.amax':
    'Raw ADC at mechanical maximum (GPIO 1–4 analog mode). amax must be greater than amin. Not present on GPIO 6.',
  'fx.filterFreq':
    'Low-pass cutoff in Hz (1–500). Firmware CF default 200 Hz. 0 is not used on this firmware — use the type’s default.',
  'fx.filterQ':
    'Biquad Q stored as integer ×0.01. 70 = Q 0.70 (Butterworth). Do not type 0.707 — type 70. Range 1–500.',
  'field.guidance.fallback':
    'FFB: Apply persists to EEPROM (sys.save!). ODrive: Apply writes RAM only — toolbar Save persists NVM and reboots.',

  // System
  'sys.vbusdiv':
    '⚠ Hardware parameter — only change if your board uses a non-standard VBUS divider. Odrive-Wheel / MKS XDrive Mini default is 19. Wrong value: all voltage readings, brake ramp thresholds, and overvoltage protection will be miscalibrated.',
};

export const guidancePt: Record<string, string> = {
  // PSU / Freio
  'config.dc_bus_overvoltage_trip_level':
    'Defina 2–4 V acima da tensão nominal da PSU. Para fonte de 48 V: 52–54 V é seguro. Muito baixo = trips falsos na aceleração do motor; muito alto = risco de dano a capacitores e FETs na regeneração. Diminua ramp_end para ficar abaixo deste valor.',
  'config.dc_bus_undervoltage_trip_level':
    'Defina ligeiramente abaixo da tensão mínima da fonte. Para LiPo 10S: ~34 V. Para fonte de bancada 48 V: ~40 V. Muito baixo = descarga silenciosa das baterias; muito alto = trips incômodos em pequenas quedas de tensão da PSU.',
  'config.brake_resistance':
    'Deve coincidir exatamente com o resistor físico (meça com multímetro). Valor errado distorce cálculos de potência e pode deixar energia de regeneração sem dissipar. Valores comuns: 0,5 Ω, 2 Ω, 8 Ω. Sem resistor instalado = defina enable_brake_resistor como false.',
  'config.enable_brake_resistor':
    'Habilite quando um resistor de freio físico estiver ligado. Sem ele, a energia de regeneração carrega o barramento DC até o trip de sobretensão — causando cortes breves do motor em frenagens FFB intensas. Essencial para sessões prolongadas de sim racing.',
  'config.dc_bus_overvoltage_ramp_start':
    'Tensão onde o duty do resistor de freio começa a subir. Deve ser ≤ ramp_end e < overvoltage_trip_level. Arranjo típico: nominal 48 V → ramp_start 50 V → ramp_end 52 V → trip 54 V.',
  'config.dc_bus_overvoltage_ramp_end':
    'Tensão onde o resistor de freio atinge 100 % de duty. Defina ramp_end = trip_level − 1 V para freio total engajar logo antes do trip disparar.',
  'config.dc_max_positive_current':
    'Limita a corrente puxada da PSU. Defina na corrente nominal da PSU ou no limite seguro do motor, o que for menor. Exceder a PSU causa queda de tensão e desligamento da fonte.',
  'config.dc_max_negative_current':
    'Limita a corrente de regeneração devolvida à PSU. Mantenha negativa (ex.: −5). Para fontes de bancada sem regeneração use −0,1 para evitar dano por backfeed. Para packs LiPo que suportam carga, ajuste à taxa C do carregador.',

  // Eixo
  'axis0.current_state':
    'Estado real do eixo — leia com r axis0.current_state. 8 = closed-loop (FFB ativo), 1 = IDLE (sem torque). É este campo que importa em operação; requested_state muitas vezes fica 0 após o comando concluir.',
  'axis0.requested_state':
    'Comando de escrita (w axis0.requested_state N). O ODrive repõe 0 quando a transição termina — ver 0 com current_state=8 é normal. Valores-chave: 1 = IDLE, 3 = calibração completa (motor gira!), 8 = closed-loop. Nunca envie 3 com volante montado.',
  'axis0.config.startup_closed_loop_control':
    'Quando true, o ODrive entra em closed-loop automaticamente após o boot — sem precisar enviar state=8 toda vez. Habilite só após motor e encoder estarem pre_calibrated. Combine com flags pre_calibrated para arranque totalmente autônomo.',
  'axis0.config.startup_motor_calibration':
    'Executa calibração R/L do motor em todo boot quando true. Após calibração OK + Salvar, defina false e active motor pre_calibrated.',
  'axis0.config.startup_encoder_offset_calibration':
    'Executa calibração de offset do encoder em todo boot quando true. Após sucesso + Salvar, defina false e active encoder pre_calibrated.',
  'axis0.config.startup_encoder_index_search':
    'Procura índice Z no boot. Só para encoders incrementais com índice ligado. Desative após encontrar e salvar.',
  'config.max_regen_current':
    'Limita corrente de regeneração no barramento DC (separado de dc_max_negative_current). Use 0 em PSUs que não aceitam backfeed.',

  // Motor
  'axis0.motor.config.current_lim':
    '⚠ Crítico para segurança. Mais corrente = mais torque = mais calor. Defina no máximo na corrente contínua nominal do motor. Exceder aquece enrolamentos e FETs do ODrive. Fórmula: current_lim = max_torque_desejado_Nm / torque_constant. Faixa típica FFB: 8–20 A.',
  'axis0.motor.config.motor_type':
    'Deve corresponder à construção física do motor. BLDC alta corrente (0) para a maioria dos motores de volante. Gimbal (2) para motores de baixa velocidade e alta indutância (raro em FFB). Tipo errado = calibração falha ou comportamento errático.',
  'axis0.motor.config.pole_pairs':
    '⚠ Deve ser exato. Conte os ímãs do rotor e divida por 2. Exemplo: 14 ímãs = 7 pares. Valor errado causa calibração falha, movimento trancoso ou erros de eixo. Confira o datasheet do motor ou conte os ímãs fisicamente.',
  'axis0.motor.config.calibration_current':
    'Corrente aplicada na sequência de calibração de resistência/indutância. Deve ser 20–30 % de current_lim. Muito baixa = calibração falha ou valores R/L imprecisos. Muito alta = motor dá solavancos violentos na calibração.',
  'axis0.motor.config.resistance_calib_max_voltage':
    'Teto de tensão na medição de resistência de fase. Padrão 4 V serve para a maioria dos motores. Suba para 6–8 V se a calibração falhar consistentemente com "phase resistance out of range" — motores de alta resistência precisam de mais tensão para a corrente de calibração.',
  'axis0.motor.config.torque_constant':
    '⚠ Crítico para precisão de torque. Kt = torque_nominal_Nm / corrente_nominal_A. Alternativa: Kt ≈ 8,27 / motor_kv. Kt errado torna axis.maxtorque sem sentido — volante fraco ou saturação de corrente. Sempre confira no datasheet do motor.',
  'axis0.motor.config.current_control_bandwidth':
    'Largura de banda do loop de corrente em rad/s. Maior = resposta de torque mais rápida = FFB mais nítido. Muito alto = oscilação e ruído. Comece em 100, aumente de 50 em 50, observe zumbido audível. Acima de 1000 exige cabeamento bom e baixa indutância.',
  'axis0.motor.config.current_control_deadband':
    'Suprime ruído de baixo nível no loop PI de corrente. 0 = resposta mais nítida (recomendado para FFB). Aumente para 0,02–0,05 se o motor produzir zumbido ou buzz em idle sem input do jogo.',
  'axis0.motor.config.pre_calibrated':
    'Pula calibração do motor no boot. Defina true só após calibração bem-sucedida com valores R/L plausíveis. Combine com encoder.pre_calibrated e startup_closed_loop_control para arranque silencioso e automático.',
  'axis0.motor.config.requested_current_range':
    'Faixa da escala de corrente em amperes. Defina ligeiramente acima de current_lim (ex.: current_lim + 2 A). Muito baixo = clipping; muito alto = menos resolução.',

  // Encoder
  'axis0.encoder.config.mode':
    'Incremental (0) para encoders quadratura A/B padrão — o mais comum. Hall (1) para feedback hall-effect de 3 fios (menor precisão). Variantes SPI para encoders absolutos que evitam busca do pulso Z no boot.',
  'axis0.encoder.config.cpr':
    '⚠ Deve coincidir exatamente com as specs do encoder. CPR = contagens por revolução (tipicamente 4× linhas por revolução em quadratura). Exemplo: encoder 2048 LPR × 4 = 8192 CPR. CPR errado: ODrive lê velocidade e posição erradas, desestabilizando o loop de corrente.',
  'axis0.encoder.config.bandwidth':
    'Largura de banda do estimador PLL em Hz. Maior = estimativa de velocidade/posição mais rápida = melhor FFB. Padrão 1000 Hz é bom. Reduza para 200–500 se o sinal do encoder for ruidoso (cabo longo, sem blindagem). Muito alto com sinal ruidoso = oscilação.',
  'axis0.encoder.config.use_index':
    'Habilite quando o encoder tem pulso Z (index) ligado e você quer homing sub-revolução. O ODrive busca o pulso Z no boot antes de entrar em closed-loop. Sem Z, o offset do encoder é arbitrário mas ainda válido após calibração.',
  'axis0.encoder.config.pre_calibrated':
    'Pula calibração de offset do encoder no boot. Válido só após pelo menos um ciclo de calibração bem-sucedido. Com use_index=true, também pula a busca do index — exige que o index seja encontrado de forma confiável antes.',
  'axis0.encoder.config.direction':
    'Resultado de calibração somente leitura (1 ou −1). O firmware define isto na calibração motor/encoder — escrita manual pode inverter o Park transform e causar oscilação ou desarme. Para inverter o sentido do volante para o utilizador/jogo, use axis.invert na aba FFB Wheel. Para detetar automaticamente, execute estado 10 (encoder dir find) na Calibração.',
  'axis0.encoder.config.abs_spi_cs_gpio_pin':
    'GPIO chip-select para encoders absolutos SPI. Padrão MKS XDrive Mini com AS5047: pino 7. Deve coincidir com a fiação.',

  // Controlador
  'axis0.controller.config.control_mode':
    '⚠ Deve ser Torque (1) para operação FFB. Modo tensão ignora o loop de corrente por completo. Modos velocidade/posição são incompatíveis com comandos diretos de torque da stack FFB.',
  'axis0.controller.config.input_mode':
    '⚠ Deve ser Passthrough (1) para FFB. Passthrough roteia input_torque direto ao loop de corrente sem filtragem interna, dando a menor latência possível. Modos rampa adicionam atraso que degrada o FFB.',
  'axis0.controller.config.vel_limit':
    'Limite de velocidade em voltas/segundo. Ativo só com enable_vel_limit=true. Para FFB normalmente desabilitado. Se usar como freio de segurança, defina 5–20 voltas/s conforme a faixa do volante.',
  'axis0.controller.config.enable_vel_limit':
    'Deixe FALSE para FFB. Habilitar faz o ODrive suprimir comando de torque quando o volante gira acima de vel_limit, lutando contra forças fortes do jogo e criando sensação mole no topo de velocidade.',
  'axis0.controller.config.enable_overspeed_error':
    'Deixe FALSE para FFB. Habilitar coloca o eixo em erro quando a velocidade excede brevemente vel_limit — comum em eventos FFB bruscos — congelando o motor inesperadamente.',
  'axis0.controller.config.enable_torque_mode_vel_limit':
    '⚠ Deve ser FALSE para FFB. Quando true, o ODrive injeta amortecimento para frear o eixo acima de vel_limit, criando forças opostas que lutam contra o FFB do jogo.',

  // Volante FFB
  'axis.range':
    'Ângulo lock-to-lock do volante em graus. Deve coincidir com o steering lock do jogo/simulador para proporção física-virtual 1:1. Valores comuns: 540° (rally/padrão em muitos sims), 900° (maioria dos sims de corrida), 1080° (carros GT). Divergência = volante bate no lock virtual antes/depois do lock físico.',
  'axis.maxtorque':
    '⚠ Teto de torque. Escala HID completa (32767) mapeia para este valor em Nm. Fórmula: axis.maxtorque = current_lim × torque_constant × axis.fxratio. Exceder capacidade de corrente do motor causa trips de proteção térmica. Muito baixo = FFB fraco. A calculadora TorqueCapAdvisor acima mostra o orçamento seguro.',
  'axis.fxratio':
    'Fator global de atenuação FFB (0,0–1,0) aplicado após cálculo de efeitos e antes do ODrive. 1,0 = torque total. Use para reduzir picos globalmente sem alterar limites de corrente do motor. Útil em sessões longas ou braços mais fracos. 0,75 é um ponto de partida comum.',
  'axis.invert':
    'Inverte a direção/posição do volante reportada ao jogo e no app (HID IN). Habilite se girar para a direita fizer o volante virtual girar para a esquerda.',
  'axis.ffbinvert':
    'Inverte o sentido da força FFB (HID OUT). Habilite se o jogo puxar a força para o lado errado (ex.: puxar contra a curva). Independente da posição.',
  'axis.idlespring':
    'Mola de centralização ativa quando nenhum jogo envia efeitos (pausado, menus, antes da corrida). 0 = volante cai livremente, 10–20 = retorno suave ao centro, 50+ = centralização forte. Evita que o volante pendule para um lado em idle.',
  'axis.axisdamper':
    'Resistência proporcional à velocidade sempre ativa, independente dos efeitos do jogo. Simula amortecimento hidráulico ou coluna pesada. 0 = sem efeito. Valores 8–20 adicionam peso sutil; 50+ cria sensação pesada e lenta. Não depende de suporte do jogo.',
  'axis.axisinertia':
    'Resistência à aceleração sempre ativa, simulando volante de inércia. 0 = sem efeito. Valores 5–20 adicionam inércia realista sem matar responsividade. Muito alto deixa o volante lento para girar. Não depende de suporte do jogo.',
  'axis.axisfriction':
    'Atrito constante (stiction) sempre ativo em todas as velocidades. 0 = desligado. Use com moderação — valores altos mascaram texturas finas do jogo e deixam o centro gomoso. Valores 5–15 adicionam sensação mecânica sem prejudicar detalhe.',
  'axis.esgain':
    'Força da mola do batente eletrônico quando o volante excede axis.range. 0 = volante pode girar livremente além do limite software (perigoso — pode bater no batente físico em velocidade). 30–80 = parede firme. 150+ = limite muito duro. Defina alto o suficiente para parar o volante no lock virtual.',
  'axis.esdamp':
    'Amortecimento no batente eletrônico para absorver quique quando o volante bate no lock virtual. Aumente se o volante oscila ou quica no batente. Valores 20–60 geralmente eliminam quique sem deixar o batente esponjoso.',
  'axis.maxtorquerate':
    'Limitador de taxa de variação de torque (max Nm/ms em contagens internas). 0 = desabilitado, resposta mais nítida possível. Valores baixos (2–6) suavizam transições bruscas de força, reduzindo choque mecânico. Muito alto filtra demais efeitos do jogo e adiciona latência percebida. Comece em 0 para sensação crua, depois adicione com moderação.',
  'axis.expo':
    'Curva de posição não linear aplicada à saída do eixo HID. 0 = linear (padrão). Positivo = mais sensível perto do centro, menos perto do lock (preferência de corrida). Negativo = zona morta no centro, mais sensibilidade nos extremos. Não afeta forças FFB, só a posição de direção reportada.',
  'axis.exposcale':
    'Divisor que controla a intensidade da curva expo. Valor maior = efeito expo mais suave. Defina 1 para expo máximo no valor configurado de axis.expo. Aumente para suavizar a curva progressivamente.',

  // Efeitos FFB
  'fx.master':
    'Ganho global aplicado a TODOS os efeitos antes de axis.fxratio. 255 = 100 % (sem atenuação). 128 = 50 %. Reduza se todos os efeitos do jogo estão fortes demais sem querer alterar níveis individuais. Multiplicativo com axis.fxratio: saída efetiva = master/255 × fxratio × axis.maxtorque.',
  'fx.spring':
    'Ganho para efeitos de condição spring dos jogos (lane-keeping, centralização, tipo spring force). 255 = escala completa do jogo. Reduza se molas parecem apertadas demais. 0 = desabilita todos os efeitos spring mantendo constant force e outros.',
  'fx.damper':
    'Ganho para efeitos de condição damper dos jogos (resistência proporcional à velocidade). Valores altos = direção pesada e lenta. Valores baixos = viva e responsiva. Faixa comum 80–180. Definir 0 desabilita condições damper — útil para isolar constant force.',
  'fx.friction':
    'Ganho para efeitos de condição friction dos jogos (resistência independente de velocidade). Muito alto mascara textura de pista e solavancos. Faixa comum 50–150. Defina 0 para desabilitar friction e ouvir só o detalhe bruto de pista/solavanco.',
  'fx.inertia':
    'Ganho para efeitos de condição inertia dos jogos (simulação de massa). 255 = volante pesado, difícil de acelerar. Valores baixos = leve e rápido. A maioria prefere 50–150. Defina 0 para desabilitar condições inertia.',

  // GPIO fallbacks
  'gpio.mode':
    'GPIO 1–4 = PA0–PA3 (ADC): 0 off, 1 botão HID 0–63, 2 eixo HID Rx/Ry/Rz/Slider, 3 zerar volante (axis.zeroenc na RAM até sys.save!). GPIO 6 = PB2 só digital — sem modo analógico, sem amin/amax/filt.',
  'gpio.idx':
    'Índice HID. Botão 0–63. Eixo analógico 0–3 (Rx/Ry/Rz/Slider) só em GPIO 1–4 modo 2. GPIO 6 é só bits de botão.',
  'gpio.invert':
    'Inverte a entrada. Botões: pressionado = 0. Analógico: inverte o intervalo. Persiste com sys.save! (EEPROM FFB S1+S2).',
  'gpio.amin':
    'ADC no mínimo mecânico (GPIO 1–4 modo analógico). Leia gpio.N.cur no batente. Não existe em GPIO 6.',
  'gpio.amax':
    'ADC no máximo mecânico (GPIO 1–4 modo analógico). amax deve ser maior que amin. Não existe em GPIO 6.',
  'fx.filterFreq':
    'Corte passa-baixa em Hz (1–500). Padrão CF do firmware: 200 Hz.',
  'fx.filterQ':
    'Q do biquad como inteiro ×0,01. 70 = Q 0,70 (Butterworth). Não escreva 0,707 — escreva 70. Faixa 1–500.',
  'field.guidance.fallback':
    'FFB: Aplicar persiste na EEPROM (sys.save!). ODrive: Aplicar grava só na RAM — use Salvar na barra para NVM e reboot.',

  // Sistema
  'sys.vbusdiv':
    '⚠ Parâmetro de hardware — altere só se a placa usar divisor VBUS não padrão. Padrão Odrive-Wheel / MKS XDrive Mini: 19. Valor errado: leituras de tensão, rampa de freio e proteção de sobretensão ficam calibrados incorretamente.',
};

export const guidanceEs: Record<string, string> = {
  // PSU / Freno
  'config.dc_bus_overvoltage_trip_level':
    'Configura 2–4 V por encima del voltaje nominal de la fuente. Para fuente de 48 V: 52–54 V es seguro. Demasiado bajo = disparos falsos al acelerar; demasiado alto = riesgo de daños a condensadores y FETs durante la regeneración.',
  'config.dc_bus_undervoltage_trip_level':
    'Configura ligeramente por debajo del voltaje mínimo de la fuente. Para LiPo 10S: ~34 V. Para fuente de laboratorio de 48 V: ~40 V.',
  'config.brake_resistance':
    'Debe coincidir exactamente con el valor físico de la resistencia de freno (medir con multímetro). Valores comunes: 0.5 Ω, 2 Ω, 8 Ω. Si no hay resistencia = poner enable_brake_resistor en false.',
  'config.enable_brake_resistor':
    'Activar cuando haya una resistencia de freno física conectada. Sin ella, la energía de regeneración carga el bus DC hasta el corte por sobrevoltaje.',
  'config.dc_bus_overvoltage_ramp_start':
    'Voltaje donde el duty cycle de la resistencia de freno comienza a subir. Debe ser ≤ ramp_end y < overvoltage_trip_level. Ejemplo: nominal 48 V → start 50 V → end 52 V → trip 54 V.',
  'config.dc_bus_overvoltage_ramp_end':
    'Voltaje donde la resistencia de freno alcanza el 100% de duty. Configura ramp_end = trip_level − 1 V para frenado completo justo antes del disparo.',
  'config.dc_max_positive_current':
    'Limita la corriente demandada de la fuente. Configura según la corriente nominal de la fuente o el límite seguro del motor.',
  'config.dc_max_negative_current':
    'Limita la corriente de regeneración devuelta a la fuente. Mantener negativa (ej.: −5). Para fuentes de laboratorio sin regeneración usa −0.1 para evitar daños.',

  // Eje
  'axis0.current_state':
    'Estado en tiempo real del eje — leer con r axis0.current_state. 8 = closed-loop (FFB activo), 1 = IDLE (sin par).',
  'axis0.requested_state':
    'Comando de escritura (w axis0.requested_state N). ODrive vuelve a 0 cuando la transición termina. Valores clave: 1 = IDLE, 3 = calibración completa, 8 = closed-loop.',
  'axis0.config.startup_closed_loop_control':
    'Si es true, ODrive entra en lazo cerrado automáticamente tras el inicio. Habilitar solo tras calibrar motor y encoder con pre_calibrated.',
  'axis0.config.startup_motor_calibration':
    'Ejecuta calibración R/L del motor en cada inicio cuando es true. Tras calibrar con éxito y guardar, poner false y activar motor.pre_calibrated.',
  'axis0.config.startup_encoder_offset_calibration':
    'Ejecuta calibración de offset del encoder en cada inicio cuando es true. Tras calibrar y guardar, poner false y activar encoder.pre_calibrated.',
  'axis0.config.startup_encoder_index_search':
    'Busca el índice Z en el inicio. Solo para encoders incrementales con índice conectado.',
  'config.max_regen_current':
    'Limita la corriente de regeneración al bus DC. Poner en 0 para fuentes que no admiten retorno de corriente.',

  // Motor
  'axis0.motor.config.current_lim':
    '⚠ Crítico de seguridad. Mayor corriente = mayor par = más calor. Configura en o por debajo de la corriente nominal continua del motor. Rango FFB típico: 8–20 A.',
  'axis0.motor.config.motor_type':
    'Debe coincidir con el motor físico. BLDC de alta corriente (0) para la mayoría de volantes direct drive.',
  'axis0.motor.config.pole_pairs':
    '⚠ Debe ser exacto. Cuenta los imanes del rotor y divide por 2. Ejemplo: 14 imanes = 7 pares de polos. Un valor incorrecto causa fallo de calibración o movimientos bruscos.',
  'axis0.motor.config.calibration_current':
    'Corriente aplicada durante la medición de resistencia/inductancia. Debe ser el 20–30% de current_lim.',
  'axis0.motor.config.resistance_calib_max_voltage':
    'Voltaje máximo durante la medición de resistencia de fase. Por defecto 4 V es suficiente.',
  'axis0.motor.config.torque_constant':
    '⚠ Crítico para la precisión del par. Kt = par_nominal_Nm / corriente_nominal_A o Kt ≈ 8.27 / motor_kv.',
  'axis0.motor.config.current_control_bandwidth':
    'Ancho de banda del lazo de corriente en rad/s. Mayor = respuesta de par más rápida. Valor inicial típico: 100–300.',
  'axis0.motor.config.current_control_deadband':
    'Suprime ruidos de baja amplitud en el lazo PI de corriente. 0 = respuesta más nítida.',
  'axis0.motor.config.pre_calibrated':
    'Omite la calibración del motor al inicio. Poner en true solo tras una calibración exitosa guardada en NVM.',
  'axis0.motor.config.requested_current_range':
    'Rango de lectura ADC del sensor de corriente en amperios. Configurar ligeramente por encima de current_lim.',

  // Encoder
  'axis0.encoder.config.mode':
    'Incremental (0) para encoders estándar A/B. Hall (1) para sensores Hall. SPI para absolutos (AS5047, MT6835).',
  'axis0.encoder.config.cpr':
    '⚠ Pulsos por revolución. AS5047 = 16384 (14 bits). MT6835 = 16384 a 65536. Encoders ópticos = 4 × líneas.',
  'axis0.encoder.config.bandwidth':
    'Filtro de seguimiento de velocidad del encoder en rad/s. Valor recomendado para FFB: 1000–3000.',
  'axis0.encoder.config.calib_range':
    'Rango de movimiento durante la calibración de offset del encoder. 0.02 es el valor estándar.',
  'axis0.encoder.config.calib_scan_distance':
    'Distancia angular en radianes eléctricos durante el barrido de calibración. 16 × π es el estándar.',
  'axis0.encoder.config.pre_calibrated':
    'Omite la calibración del encoder en el arranque. Poner true solo tras alinear offset con éxito y guardar en NVM.',

  // Controlador
  'axis0.controller.config.control_mode':
    'CONTROL_MODE_TORQUE_CONTROL (1) es obligatorio para operación Direct Drive FFB.',
  'axis0.controller.config.input_mode':
    'INPUT_MODE_PASSTHROUGH (1) para enviar setpoints directos de par desde el puente FFB sin rampas intermedias.',
  'axis0.controller.config.torque_lim':
    'Límite de seguridad de par en Nm aplicado por el controlador ODrive. Debe ser ≥ axis.maxtorque.',

  // Volante FFB
  'axis.maxtorque':
    'Par máximo entregado por el volante FFB en Nm (al 100% de fuerza del simulador). No exceder el límite físico del motor.',
  'axis.fxratio':
    'Multiplicador de intensidad de efectos FFB (0.0 a 2.0). 1.0 = 100% de la fuerza configurada.',
  'axis.range':
    'Rango total de rotación del volante en grados (ej.: 900° = ±450°, 540° = ±270°, 1080° = ±540°).',
  'axis.invert':
    'Invierte la dirección del ángulo reportado a Windows/juegos (HID IN). 0 = normal, 1 = invertido.',
  'axis.invertforce':
    'Invierte la dirección de la fuerza FFB (HID OUT). Activar si el simulador empuja la fuerza en sentido contrario.',
  'axis.idlespring':
    'Fuerza de centrado activa cuando no hay efectos de juego (menús, pausa). 0 = suelto, 10–20 = centrado suave.',
  'axis.axisdamper':
    'Amortiguación constante proporcional a la velocidad. Simula peso hidráulico o columna de dirección pesada.',
  'axis.axisinertia':
    'Inercia constante aplicada a la aceleración del volante. Añade peso realista sin perder agilidad.',
  'axis.axisfriction':
    'Fricción mecánica constante en todas las velocidades.',
  'axis.esgain':
    'Rigidez del tope electrónico de fin de carrera cuando el volante supera axis.range.',
  'axis.esdamp':
    'Amortiguación en el tope electrónico para absorber el rebote al golpear el límite virtual.',
  'axis.maxtorquerate':
    'Limitador de tasa de cambio de par (Nm/ms). 0 = respuesta directa instantánea.',
  'axis.expo':
    'Curva de sensibilidad no lineal en la posición reportada por el volante. 0 = lineal.',
  'axis.exposcale':
    'Factor de escala para la curva exponencial.',

  // Efectos FFB
  'fx.master':
    'Ganancia maestra global aplicada a todos los efectos FFB antes de axis.fxratio. 255 = 100%.',
  'fx.spring':
    'Ganancia para efectos de muelle (spring) del juego. 255 = escala completa.',
  'fx.damper':
    'Ganancia para efectos de amortiguación (damper) del juego. 255 = escala completa.',
  'fx.friction':
    'Ganancia para efectos de fricción (friction) del juego. 255 = escala completa.',
  'fx.inertia':
    'Ganancia para efectos de inercia (inertia) del juego. 255 = escala completa.',

  // GPIO
  'gpio.mode':
    'GPIO 1–4 = PA0–PA3 (ADC): 0 desactivado, 1 botón HID, 2 eje analógico HID, 3 centrado de volante. GPIO 6 = PB2 solo digital.',
  'gpio.idx':
    'Índice HID. Botón 0–63. Eje analógico 0–3 (Rx/Ry/Rz/Slider) en GPIO 1–4.',
  'gpio.invert':
    'Invierte la entrada. Botones: pulsado = 0. Analógico: invierte el recorrido. Guardar con sys.save! (EEPROM FFB).',
  'gpio.amin':
    'Valor ADC en el mínimo mecánico (GPIO 1–4 modo analógico).',
  'gpio.amax':
    'Valor ADC en el máximo mecánico (GPIO 1–4 modo analógico).',
  'fx.filterFreq':
    'Frecuencia de corte paso bajo en Hz (1–500). Por defecto CF del firmware: 200 Hz.',
  'fx.filterQ':
    'Factor Q del filtro biquad como entero ×0.01. 70 = Q 0.70 (Butterworth). Rango 1–500.',
  'field.guidance.fallback':
    'FFB: Aplicar guarda en EEPROM (sys.save!). ODrive: Aplicar guarda solo en RAM — usa Guardar en barra superior para NVM y reinicio.',

  // Sistema
  'sys.vbusdiv':
    '⚠ Parámetro de hardware — modificar solo si la placa usa un divisor VBUS no estándar. Por defecto MKS XDrive Mini: 19.',
};
