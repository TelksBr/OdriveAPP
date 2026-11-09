import { useEffect, useRef } from 'react';
import { useAppState } from '../../app/AppState';
import { translate, type Locale } from '../../i18n/messages';
import { toast, toastKey } from '../../shared/toastActions';
import { formatSerialRxLine } from './serialLogFormat';
import { serialService, type SerialEvent } from './SerialService';
import { connectionPhase } from './connectionStatus';

export function useSerialSession() {
  const { state, dispatch } = useAppState();
  const reconnectInFlightRef = useRef(false);
  const manualDisconnectRequestedRef = useRef(false);
  const autoReconnectBlockedRef = useRef(false);
  const localeRef = useRef(state.locale);
  localeRef.current = state.locale;
  const phase = connectionPhase(state);

  useEffect(() => {
    function onSerialEvent(event: SerialEvent) {
      const locale = localeRef.current;
      if (event.type === 'connected') {
        autoReconnectBlockedRef.current = false;
        dispatch({ type: 'set-connected', connected: true });
        dispatch({ type: 'append-log', direction: 'info', message: translate(locale, 'serialConnectedLog') });
        if (event.firmware) {
          dispatch({
            type: 'append-log',
            direction: 'info',
            message: translate(locale, 'serialFirmwareLog', { ver: event.firmware }),
          });
        }
      } else if (event.type === 'disconnected') {
        if (manualDisconnectRequestedRef.current) {
          autoReconnectBlockedRef.current = true;
          manualDisconnectRequestedRef.current = false;
        }
        dispatch({ type: 'set-connected', connected: false });
        dispatch({ type: 'append-log', direction: 'info', message: translate(locale, 'serialDisconnectedLog') });
      } else if (event.type === 'rx') {
        dispatch({
          type: 'append-log',
          direction: 'rx',
          message: formatSerialRxLine(event.line, event.command),
        });
      } else if (event.type === 'tx') {
        dispatch({ type: 'append-log', direction: 'tx', message: event.line });
      } else if (event.type === 'info') {
        dispatch({ type: 'append-log', direction: 'info', message: event.message });
      } else if (event.type === 'desync') {
        dispatch({ type: 'append-log', direction: 'error', message: event.message });
      } else if (event.type === 'link-dead') {
        dispatch({ type: 'append-log', direction: 'error', message: translate(locale, 'serialLinkLost') });
        toastKey(dispatch, locale, 'serialLinkLost', 'warn');
      } else {
        dispatch({ type: 'append-log', direction: 'error', message: event.message });
      }
    }

    return serialService.subscribe(onSerialEvent);
  }, [dispatch]);

  useEffect(() => {
    function releasePort() {
      void serialService.disconnect();
    }
    window.addEventListener('pagehide', releasePort);
    window.addEventListener('beforeunload', releasePort);
    return () => {
      window.removeEventListener('pagehide', releasePort);
      window.removeEventListener('beforeunload', releasePort);
    };
  }, []);

  useEffect(() => {
    const serial = navigator.serial;
    if (!serial) {
      return undefined;
    }
    function onUsbDisconnect(event: SerialConnectionEvent) {
      if (serialService.ownsPort(event.port)) {
        void serialService.disconnect();
      }
    }
    serial.addEventListener('disconnect', onUsbDisconnect);
    return () => serial.removeEventListener('disconnect', onUsbDisconnect);
  }, []);

  useEffect(() => {
    if (
      !state.serialSupported ||
      !state.autoReconnect ||
      state.connected ||
      state.connecting ||
      state.busy ||
      autoReconnectBlockedRef.current
    ) {
      return undefined;
    }

    let cancelled = false;
    let timer = 0;
    let delayMs = 1000;

    async function loop() {
      dispatch({ type: 'set-reconnecting', reconnecting: true });
      try {
        while (!cancelled) {
          if (reconnectInFlightRef.current) {
            await new Promise<void>((resolve) => {
              timer = window.setTimeout(resolve, delayMs);
            });
            continue;
          }
          reconnectInFlightRef.current = true;
          try {
            const ok = await serialService.reconnectKnownPort(3, 1000);
            if (ok || cancelled) {
              return;
            }
            dispatch({
              type: 'append-log',
              direction: 'info',
              message: translate(localeRef.current, 'noKnownPortLog'),
            });
          } catch (error) {
            if (!cancelled) {
              dispatch({
                type: 'append-log',
                direction: 'error',
                message: error instanceof Error ? error.message : String(error),
              });
            }
          } finally {
            reconnectInFlightRef.current = false;
          }
          await new Promise<void>((resolve) => {
            timer = window.setTimeout(resolve, delayMs);
          });
          delayMs = Math.min(delayMs * 2, 30_000);
        }
      } finally {
        dispatch({ type: 'set-reconnecting', reconnecting: false });
      }
    }

    void loop();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [dispatch, state.autoReconnect, state.busy, state.connected, state.connecting, state.serialSupported]);

  async function toggleConnection() {
    if (state.connecting) {
      return;
    }
    try {
      if (phase === 'live') {
        manualDisconnectRequestedRef.current = true;
        await serialService.disconnect();
        return;
      }
      autoReconnectBlockedRef.current = false;
      dispatch({ type: 'set-connecting', connecting: true });
      toastKey(dispatch, state.locale, 'serialConnecting', 'info');
      await serialService.connect({ allowPicker: true });
      toastKey(dispatch, state.locale, 'serialConnectedLog', 'ok');
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const msg = translateSerialError(state.locale, raw);
      dispatch({ type: 'append-log', direction: 'error', message: msg });
      toast(dispatch, msg, 'error');
    } finally {
      dispatch({ type: 'set-connecting', connecting: false });
    }
  }

  async function connectWithPort(portName: string) {
    if (state.connecting) {
      return;
    }
    try {
      autoReconnectBlockedRef.current = false;
      dispatch({ type: 'set-connecting', connecting: true });
      toastKey(dispatch, state.locale, 'serialConnecting', 'info');
      await serialService.connect({ portName, allowPicker: false });
      toastKey(dispatch, state.locale, 'serialConnectedLog', 'ok');
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const msg = translateSerialError(state.locale, raw);
      dispatch({ type: 'append-log', direction: 'error', message: msg });
      toast(dispatch, msg, 'error');
    } finally {
      dispatch({ type: 'set-connecting', connecting: false });
    }
  }

  return { toggleConnection, connectWithPort, phase };
}

function translateSerialError(locale: Locale, raw: string): string {
  if (
    raw === 'serialWrongPort' ||
    raw === 'serialConnectCancelled' ||
    raw === 'serialHandshakeFailed' ||
    raw === 'serialNoLivePort' ||
    raw === 'serialLinkLost'
  ) {
    return translate(locale, raw);
  }
  if (raw === 'Web Serial is not available') {
    return translate(locale, 'serialUnsupported');
  }
  return raw;
}
