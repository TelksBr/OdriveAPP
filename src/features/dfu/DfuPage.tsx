import { useCallback, useEffect, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { rebootToDfuAndDisconnect } from '../board/boardLifecycle';
import { clearOdriveRamPending } from '../board/persistPending';
import { serialService } from '../serial/SerialService';
import { dfuService } from './DfuService';
import { toastKey } from '../../shared/toastActions';
import { Card, Pill } from '../../shared/ui';

export function DfuPage() {
  const { state, dispatch } = useAppState();
  const [bootloader, setBootloader] = useState('');
  const [firmware, setFirmware] = useState<ArrayBuffer | null>(null);
  const [firmwareName, setFirmwareName] = useState('');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState(() => translate(state.locale, 'dfuIdle'));

  const report = useCallback(
    (nextMessage: string, nextProgress?: number) => {
      setMessage(nextMessage);
      if (nextProgress !== undefined) {
        setProgress(Math.round(nextProgress));
      }
      dispatch({ type: 'append-log', direction: 'info', message: nextMessage });
    },
    [dispatch],
  );

  // Auto-detect if bootloader is already plugged in (e.g., page reload or manual reboot)
  useEffect(() => {
    let mounted = true;
    void dfuService.checkBootloaderPresent().then((name) => {
      if (mounted && name) {
        setBootloader(name);
        report(translate(state.locale, 'dfuBootloaderConnected', { name }));
      }
    });
    return () => {
      mounted = false;
    };
  }, [report, state.locale]);

  async function run(action: () => Promise<void>) {
    dispatch({ type: 'set-busy', busy: true });
    try {
      await action();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      dispatch({ type: 'append-log', direction: 'error', message: msg });
      report(msg);
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  return (
    <Card title={translate(state.locale, 'dfu')} description={translate(state.locale, 'dfuDescription')}>
      <ol className="maintain-dfu-steps">
        <li>{translate(state.locale, 'dfuStep1')}</li>
        <li>{translate(state.locale, 'dfuStep2')}</li>
        <li>{translate(state.locale, 'dfuStep3')}</li>
        <li>{translate(state.locale, 'dfuStep4')}</li>
      </ol>

      <p className="setup-checkpoint-hint">{translate(state.locale, 'dfuConfigPreserve')}</p>
      <p className="muted">{translate(state.locale, 'dfuZadigHint')}</p>

      {!state.usbSupported ? <p className="warning">{translate(state.locale, 'noUsb')}</p> : null}

      <div className="status-row">
        <Pill tone={bootloader ? 'ok' : 'neutral'}>{bootloader || translate(state.locale, 'dfuBootloaderNotSelected')}</Pill>
        <Pill tone={firmware ? 'ok' : 'neutral'}>{firmwareName || translate(state.locale, 'dfuNoFirmwareSelected')}</Pill>
      </div>

      <div className="toolbar">
        <button
          type="button"
          disabled={!state.connected || state.busy}
          onClick={() =>
            void run(async () => {
              serialService.setDfuMode(true);
              report(translate(state.locale, 'dfuRebootSent'));
              toastKey(dispatch, state.locale, 'dfuRebootSent', 'info');

              await rebootToDfuAndDisconnect();
              clearOdriveRamPending(dispatch);
              setBootloader('');

              // Give STM32 3 seconds to reset and re-enumerate on the USB bus
              for (let sec = 3; sec > 0; sec -= 1) {
                report(`Aguardando USB do STM32 re-enumerar (${sec}s)...`);
                await new Promise((r) => setTimeout(r, 1000));
              }

              // Automatically poll for bootloader
              report('Detectando bootloader STM32 no barramento USB...');
              let detected = '';
              for (let attempt = 0; attempt < 8; attempt += 1) {
                const name = await dfuService.checkBootloaderPresent();
                if (name) {
                  detected = name;
                  break;
                }
                await new Promise((r) => setTimeout(r, 500));
              }

              if (detected) {
                setBootloader(detected);
                report(translate(state.locale, 'dfuBootloaderConnected', { name: detected }));
                toastKey(dispatch, state.locale, 'dfuBootloaderConnected', 'ok');
              } else {
                report('Bootloader pronto. Clique em "Procurar bootloader" para conectar.');
              }
            })
          }
        >
          {translate(state.locale, 'dfuRebootToDfu')}
        </button>
        <button
          type="button"
          disabled={!state.usbSupported || state.busy}
          onClick={() =>
            void run(async () => {
              serialService.setDfuMode(true);
              const name = await dfuService.requestBootloader();
              setBootloader(name);
              report(translate(state.locale, 'dfuBootloaderConnected', { name }));
            })
          }
        >
          {translate(state.locale, 'findBootloader')}
        </button>
        <label className="button-like">
          {translate(state.locale, 'chooseFirmware')}
          <input
            type="file"
            accept=".bin,application/octet-stream"
            hidden
            disabled={state.busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }
              if (!file.name.toLowerCase().endsWith('.bin')) {
                toastKey(dispatch, state.locale, 'dfuInvalidFirmware', 'error');
                event.target.value = '';
                return;
              }
              setFirmwareName(file.name);
              void file.arrayBuffer().then((buffer) => {
                setFirmware(buffer);
                report(translate(state.locale, 'dfuFirmwareSelected', { name: file.name }));
              });
            }}
          />
        </label>
        <button
          type="button"
          className="ok"
          disabled={!firmware || state.busy}
          onClick={() =>
            void run(async () => {
              if (!firmware) {
                return;
              }
              await dfuService.flash(firmware, report);
              setBootloader('');
              serialService.setDfuMode(false);
              toastKey(dispatch, state.locale, 'dfuFlashComplete', 'ok');
              report(translate(state.locale, 'dfuFlashCompleteHint'));
            })
          }
        >
          {translate(state.locale, 'flashFirmware')}
        </button>
      </div>

      <div className="progress">
        <div style={{ width: `${progress}%` }} />
      </div>
      <p className="muted">{message}</p>
    </Card>
  );
}
