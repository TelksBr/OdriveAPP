import { useEffect, useState } from 'react';
import { AppStateProvider, useAppState } from './app/AppState';
import { tabs } from './app/tabs';
import { translate } from './i18n/messages';
import { useSerialSession } from './features/serial/useSerialSession';
import { connectionStatusMessageKey, connectionStatusTone } from './features/serial/connectionStatus';
import { readField } from './features/board/BoardProtocol';
import { useBoardSave } from './features/board/useBoardSave';
import { initialFieldsForTab, refreshFieldsForTab } from './app/refreshPolicy';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { CalibrationPage } from './features/calibration/CalibrationPage';
import { ConfigPage } from './features/config/ConfigPage';
import { ConsolePage } from './features/console/ConsolePage';
import { QuickStartPage } from './features/setup/QuickStartPage';
import { TuneWorkspace } from './features/workspaces/TuneWorkspace';
import { MaintainWorkspace } from './features/workspaces/MaintainWorkspace';
import { ObserveTelemetryProvider, useObserveTelemetry } from './features/observe/ObserveTelemetryContext';
import { ObserveWorkspace } from './features/workspaces/ObserveWorkspace';
import { InputsWorkspace } from './features/workspaces/InputsWorkspace';
import { CommandCenterPage } from './features/commands/CommandCenterPage';
import { PwaStatus } from './features/pwa/PwaStatus';
import { FfbTestPage } from './features/hid/FfbTestPage';
import { PerformanceTestPage } from './features/perfTest/PerformanceTestPage';
import { AboutPage } from './features/about/AboutPage';
import { Pill } from './shared/ui';
import { AppIcon } from './shared/ui/AppIcon';
import { LiveAppLogo } from './shared/ui/LiveAppLogo';
import { LanguageSelector } from './shared/ui/LanguageSelector';
import { useWheelPositionPoll } from './features/wheel/useWheelPositionPoll';
import { SidebarSearch } from './features/navigation/SidebarSearch';
import { FieldFocusEffect } from './features/navigation/FieldFocusEffect';
import { ToastHost } from './shared/ToastHost';
import {
  isDesktopApp,
  nativeDetectRunningSim,
  nativeEmergencyStop,
  type SimGameInfo,
} from './features/serial/nativeSerialBridge';
import { serialService } from './features/serial/SerialService';
import { hidFfbService } from './features/hid/HidFfbService';
import { PortPickerModal } from './features/serial/PortPickerModal';

function AppShell() {
  const { state, dispatch } = useAppState();
  const { pollingActive } = useObserveTelemetry();
  const [navQuery, setNavQuery] = useState('');
  const [detectedGame, setDetectedGame] = useState<SimGameInfo | null>(null);
  const [portPickerOpen, setPortPickerOpen] = useState(false);
  const [activePortName, setActivePortName] = useState<string | null>(
    () => localStorage.getItem('wheelforge-selected-com-port')
  );
  const { toggleConnection, connectWithPort, phase } = useSerialSession();
  const { saveAll, saveButtonLabel, saveBadge } = useBoardSave();

  function handleConnectClick() {
    if (phase === 'live') {
      void toggleConnection();
      return;
    }
    if (isDesktopApp()) {
      setPortPickerOpen(true);
      return;
    }
    void toggleConnection();
  }

  async function handlePortSelected(portName: string) {
    setActivePortName(portName);
    await connectWithPort(portName);
  }

  useEffect(() => {
    if (!isDesktopApp()) return;
    let active = true;
    const checkGame = async () => {
      try {
        const game = await nativeDetectRunningSim();
        if (active) setDetectedGame(game);
      } catch {
        // ignore
      }
    };
    void checkGame();
    const timer = setInterval(() => void checkGame(), 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  async function handleEmergencyStop() {
    try {
      if (isDesktopApp()) {
        await nativeEmergencyStop();
      } else {
        await serialService.sendCommand('w axis0.requested_state 1', false);
        await hidFfbService.stopAll();
      }
      dispatch({
        type: 'append-log',
        direction: 'error',
        message: '🚨 PARADA DE EMERGÊNCIA DISPARADA — Motor desarmado (IDLE)',
      });
    } catch (e) {
      dispatch({
        type: 'append-log',
        direction: 'error',
        message: `Falha no E-Stop: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
  const skipReadPaths = [...new Set([...state.dirtyPaths, ...state.nvmPendingPaths])];
  const skipReadKey = skipReadPaths.join('\0');
  const wheelPollActive = state.connected && !state.busy && state.activeTab !== 'calibration';
  const serialPollLogo = wheelPollActive && state.activeTab !== 'dashboard' && !pollingActive;
  const wheelPositionDegRef = useWheelPositionPoll(state.connected, wheelPollActive, serialPollLogo);

  useEffect(() => {
    if (!state.connected || state.busy) {
      return undefined;
    }

    let cancelled = false;
    async function readInitialPageFields() {
      const fields =
        state.activeTab === 'calibration'
          ? refreshFieldsForTab(state.activeTab, skipReadPaths)
          : initialFieldsForTab(state.activeTab, skipReadPaths);
      if (fields.length === 0) {
        return;
      }
      try {
        for (const field of fields) {
          if (cancelled) {
            return;
          }
          const value = await readField(field);
          dispatch({ type: 'set-field', path: field.path, value, dirty: false });
        }
        dispatch({ type: 'mark-refreshed' });
      } catch (error) {
        if (!cancelled) {
          dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      }
    }

    void readInitialPageFields();
    return () => {
      cancelled = true;
    };
  }, [skipReadKey, dispatch, state.activeTab, state.busy, state.connected]);

  async function manualRefreshAll() {
    if (!state.connected || state.busy) return;
    dispatch({ type: 'set-busy', busy: true });
    try {
      // Force-read all fields for the current tab (ignore dirty paths)
      const fields = initialFieldsForTab(state.activeTab, []);
      for (const field of fields) {
        const value = await readField(field);
        dispatch({ type: 'set-field', path: field.path, value, dirty: false });
      }
      dispatch({ type: 'mark-refreshed' });
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  function renderActiveTab() {
    switch (state.activeTab) {
      case 'dashboard':
        return <DashboardPage />;
      case 'setup':
        return <QuickStartPage />;
      case 'calibration':
        return <CalibrationPage />;
      case 'motor':
        return (
          <ConfigPage
            filter="odrive"
            includeGroups={['psu', 'axis', 'motor', 'encoder', 'controller', 'fet-thermistor', 'motor-thermistor']}
            allowOpenffboardPaths={['sys.vbusdiv']}
          />
        );
      case 'tune':
        return <TuneWorkspace />;
      case 'ffb-test':
        return <FfbTestPage />;
      case 'perf-test':
        return <PerformanceTestPage />;
      case 'inputs':
        return <InputsWorkspace />;
      case 'observe':
        return <ObserveWorkspace />;
      case 'maintain':
        return <MaintainWorkspace />;
      case 'commands':
        return <CommandCenterPage />;
      case 'console':
        return <ConsolePage />;
      case 'about':
        return <AboutPage />;
      default:
        return <DashboardPage />;
    }
  }

  const activeTab = tabs.find((tab) => tab.id === state.activeTab);
  const activeGroupKey = `group${(activeTab?.group ?? 'operate')[0].toUpperCase()}${(activeTab?.group ?? 'operate').slice(1)}`;

  return (
    <div className="app-shell">
      <FieldFocusEffect />
      <ToastHost />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-lockup">
            <LiveAppLogo size={32} connected={state.connected} positionDegRef={wheelPositionDegRef} />
            <div>
              <strong>{translate(state.locale, 'appTitle')}</strong>
              <span>{translate(state.locale, 'appSubtitle')}</span>
            </div>
          </div>
        </div>
        <SidebarSearch query={navQuery} onQueryChange={setNavQuery} />
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-context">
            <div>
              <span className="eyebrow">{translate(state.locale, activeGroupKey)}</span>
              <h1>{activeTab ? translate(state.locale, activeTab.labelKey) : translate(state.locale, 'appTitle')}</h1>
            </div>
            <div className="topbar-pills">
              <Pill tone={connectionStatusTone(phase)}>
                {translate(state.locale, connectionStatusMessageKey(phase))}
              </Pill>
              {isDesktopApp() && (
                <Pill tone="neutral">
                  Windows Native
                </Pill>
              )}
              {detectedGame && (
                <Pill tone="ok">
                  🏎️ {detectedGame.name}
                </Pill>
              )}
              {state.busy && <Pill tone="warn">{translate(state.locale, 'busy')}</Pill>}
              {state.lastRefreshAt && (
                <Pill tone="neutral">{translate(state.locale, 'refreshed')} {state.lastRefreshAt}</Pill>
              )}
            </div>
          </div>

          <div className="topbar-actions">
            {/* Manual read-all for current page */}
            <button
              type="button"
              className="topbar-refresh-btn"
              disabled={!state.connected || state.busy}
              onClick={() => void manualRefreshAll()}
              title={translate(state.locale, 'refreshPageTitle')}
            >
              <AppIcon id="icon-refresh" size={14} />
              {translate(state.locale, 'refreshPage')}
            </button>

            <button
              type="button"
              className="topbar-save-btn ok"
              disabled={!state.connected || state.busy}
              onClick={() => void saveAll()}
              title={translate(state.locale, 'saveTitle')}
            >
              <AppIcon id="icon-save" size={14} />
              {saveButtonLabel()}{saveBadge}
            </button>

            <div className="topbar-divider" aria-hidden="true" />

            {/* Auto-reconnect */}
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={state.autoReconnect}
                onChange={(event) => dispatch({ type: 'set-auto-reconnect', autoReconnect: event.target.checked })}
              />
              {translate(state.locale, 'autoReconnect')}
            </label>

            <div className="topbar-divider" aria-hidden="true" />

            {/* Language */}
            <LanguageSelector
              locale={state.locale}
              onChange={(locale) => dispatch({ type: 'set-locale', locale })}
            />

            <PwaStatus locale={state.locale} />

            {/* In desktop app, allow changing the COM port anytime */}
            {isDesktopApp() && (
              <button
                type="button"
                className="topbar-refresh-btn"
                onClick={() => setPortPickerOpen(true)}
                title="Selecionar porta COM serial"
                style={{ fontSize: '12px' }}
              >
                🔌 {activePortName || 'Porta COM'}
              </button>
            )}

            {/* E-Stop emergency cutoff */}
            {state.connected && (
              <button
                type="button"
                className="danger"
                onClick={() => void handleEmergencyStop()}
                title="Desarmar motor imediatamente (E-Stop)"
                style={{ fontWeight: 'bold' }}
              >
                🚨 E-STOP
              </button>
            )}

            {/* Connect / Disconnect */}
            <button
              type="button"
              disabled={!state.serialSupported || phase === 'connecting'}
              className={phase === 'live' ? 'danger' : ''}
              title={phase === 'live' ? undefined : translate(state.locale, 'connectSerialTitle')}
              onClick={() => void handleConnectClick()}
            >
              {phase === 'connecting'
                ? translate(state.locale, 'serialConnecting')
                : translate(state.locale, phase === 'live' ? 'disconnect' : 'connect')}
            </button>
          </div>
        </header>
        <section className="content">{renderActiveTab()}</section>
      </main>

      <PortPickerModal
        open={portPickerOpen}
        onClose={() => setPortPickerOpen(false)}
        onSelectPort={handlePortSelected}
        currentPort={activePortName}
        busy={phase === 'connecting'}
      />
    </div>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <ObserveTelemetryProvider>
        <AppShell />
      </ObserveTelemetryProvider>
    </AppStateProvider>
  );
}
