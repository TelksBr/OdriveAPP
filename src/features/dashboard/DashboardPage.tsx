import { Component, lazy, Suspense, type ReactNode } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { connectionPhase, connectionStatusMessageKey, connectionStatusTone } from '../serial/connectionStatus';
import { SectionHeader } from '../../shared/ui';
import { QuickActions } from '../board/QuickActions';
import { zeroWheel } from '../calibration/calibrationPresets';
import { useDashboardLivePoll } from './useDashboardLivePoll';
import { DashboardLiveMetrics } from './DashboardLiveMetrics';
import { DashboardAnalogAxes } from './DashboardAnalogAxes';

class WheelErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn('Wheel 3D viewer failed to load, falling back to 2D view:', err);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}

// Lazy-load the heavy Three.js bundle into a separate chunk
const WheelViewer = lazy(() =>
  import('./WheelViewer').then((m) => {
    try {
      m.preloadWheelModel();
    } catch {
      // ignore
    }
    return { default: m.WheelViewer };
  }),
);

export function DashboardPage() {
  const { state, dispatch } = useAppState();
  const live = useDashboardLivePoll(state.connected, state.fieldValues, state.busy);
  const phase = connectionPhase(state);
  const statusTone = connectionStatusTone(phase);

  async function centerWheel() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      const ok = await zeroWheel(dispatch);
      dispatch({
        type: 'append-log',
        direction: ok ? 'info' : 'error',
        message: translate(
          state.locale,
          ok ? 'dashboardWheelCenteredSaved' : 'dashboardWheelCenteredEepromFail',
        ),
      });
    } catch (error) {
      dispatch({
        type: 'append-log',
        direction: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  return (
    <div className="dashboard-main">
      <SectionHeader
        eyebrow={translate(state.locale, 'heroEyebrow')}
        title={translate(state.locale, 'heroTitle')}
        description={translate(state.locale, 'heroDescription')}
      />

      <div className="dashboard-body">
        {/* ── Left — 3D viewer ──────────────────────────────────────── */}
        <div className="wheel-panel">
          <WheelErrorBoundary
            fallback={
              <div
                className="wheel-viewer wheel-viewer--loading-shell"
                style={{
                  height: 340,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <div style={{ fontSize: '48px', opacity: 0.8 }}>🏎️</div>
                <span className="muted" style={{ fontSize: '13px' }}>
                  Visualizador 3D indisponível (Modo 2D ativo)
                </span>
              </div>
            }
          >
            <Suspense
              fallback={
                <div className="wheel-viewer wheel-viewer--loading-shell" style={{ height: 340 }}>
                  <div className="wheel-viewer-loading" aria-busy="true">
                    <div className="wheel-viewer-spinner" />
                    <span className="wheel-viewer-loading-label">
                      {translate(state.locale, 'wheelModelLoading')}
                    </span>
                  </div>
                </div>
              }
            >
              <WheelViewer positionDegRef={live.positionDegRef} connected={state.connected} height={340} />
            </Suspense>
          </WheelErrorBoundary>

          <DashboardAnalogAxes
            connected={state.connected}
            positionDegRef={live.positionDegRef}
            torqueNm={live.torqueNm}
            maxTorqueNm={live.maxTorqueNm}
            gpioInputs={live.gpioInputs}
            polling={live.polling}
          />

          <div className="wheel-readout">
            <div className="wheel-actions">
              <button
                type="button"
                disabled={!state.connected || state.busy}
                onClick={() => void centerWheel()}
                title={translate(state.locale, 'centerWheelTitle')}
              >
                ⊙ {translate(state.locale, 'centerWheel')}
              </button>
            </div>
          </div>
        </div>

        {/* ── Right — status + metrics + actions ──────────────────── */}
        <div className="dashboard-side">
          {/* Connection status */}
          <div className="dashboard-connection">
            <span className="eyebrow">{translate(state.locale, 'statusBoard')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background:
                    statusTone === 'ok' ? 'var(--ok)' : statusTone === 'warn' ? 'var(--warn)' : 'var(--muted-2)',
                  flexShrink: 0,
                }}
              />
              <strong style={{ fontSize: 14 }}>
                {translate(state.locale, connectionStatusMessageKey(phase))}
              </strong>
            </div>
          </div>

          {/* Live metrics */}
          <div className="dashboard-section">
            <span className="eyebrow">{translate(state.locale, 'dashboardLiveMetrics')}</span>
            <DashboardLiveMetrics connected={state.connected} metrics={live.metrics} />
          </div>

          {/* Quick actions */}
          <div className="dashboard-section">
            <span className="eyebrow">{translate(state.locale, 'dashboardQuickActions')}</span>
            <QuickActions categories={['safety', 'ffb']} />
          </div>
        </div>
      </div>
    </div>
  );
}
