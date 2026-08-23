import { useMemo } from 'react';
import { useAppState } from '../../app/AppState';
import { usePageVisible } from '../../shared/usePageVisible';
import { translate } from '../../i18n/messages';
import { Card, SectionHeader } from '../../shared/ui';
import { LiveMonitorPanel } from '../live/LiveMonitorPanel';
import { useObserveTelemetry } from '../observe/ObserveTelemetryContext';
import { TimeSeriesChart } from '../telemetry/TimeSeriesChart';
import { TelemetryControlPanel } from '../telemetry/TelemetryControlPanel';
import { TelemetryOverlay } from '../telemetry/TelemetryOverlay';
import { busSeries, localizedSeries, motionSeries } from '../telemetry/series';
import { ObserveQuickBar } from './ObserveQuickBar';
import { ObserveStatsTable } from './ObserveStatsTable';

export function ObserveWorkspace() {
  const { state } = useAppState();
  const locale = state.locale;
  const pageVisible = usePageVisible();
  const {
    observe,
    enabled,
    setEnabled,
    chartHz,
    setChartHz,
    serialChartHz,
    setSerialChartHz,
    windowMs,
    setWindowMs,
    pipOpen,
    pollingActive,
  } = useObserveTelemetry();

  const localizedBusSeries = useMemo(() => localizedSeries(locale, busSeries), [locale]);
  const localizedMotionSeries = useMemo(() => localizedSeries(locale, motionSeries), [locale]);

  return (
    <div className="page-stack observe-page">
      <SectionHeader
        eyebrow={translate(locale, 'observeEyebrow')}
        title={translate(locale, 'observeTitle')}
        description={translate(locale, 'observeDescription')}
      />

      <Card
        title={translate(locale, 'observePanelTitle')}
        description={translate(locale, 'observePanelDescription')}
      >
        <div className="observe-panel-body">
          <ObserveQuickBar />

          <section className="observe-section">
            <h3 className="observe-section-title">{translate(locale, 'observeSectionTelemetry')}</h3>
            <TelemetryControlPanel
              locale={locale}
              connected={state.connected}
              enabled={enabled}
              onEnabledChange={setEnabled}
              chartHz={chartHz}
              onChartHzChange={setChartHz}
              serialChartHz={serialChartHz}
              onSerialChartHzChange={setSerialChartHz}
              windowMs={windowMs}
              onWindowChange={setWindowMs}
              telemetry={observe}
            />
            <TelemetryOverlay
              backgroundActive={pollingActive && state.connected && !pageVisible}
            />
            {pipOpen ? (
              <p className="observe-pip-active-hint muted">
                {translate(locale, 'overlayChartsInPip')}
              </p>
            ) : (
            <div className="chart-grid observe-chart-grid">
              <TimeSeriesChart
                title={translate(locale, 'observeChartDcBus')}
                samples={observe.displaySamples}
                series={localizedBusSeries}
                windowMs={windowMs}
                height={240}
                drawHz={chartHz}
              />
              <TimeSeriesChart
                title={translate(locale, 'observeChartWheel')}
                samples={observe.displaySamples}
                series={localizedMotionSeries}
                windowMs={windowMs}
                height={240}
                drawHz={chartHz}
              />
            </div>
            )}
            <ObserveStatsTable stats={observe.stats} locale={locale} />
          </section>

          <LiveMonitorPanel
            session={observe.session}
            polling={enabled && state.connected}
            onPollDiag={() => void observe.pollDiag()}
          />
        </div>
      </Card>
    </div>
  );
}
