import { useMemo } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { axisStateLabel } from '../../i18n/fieldMeta';
import {
  firstActiveError,
  metricsErrorOk,
  VBUS_WARN_V,
  type DashboardMetricsRaw,
} from './dashboardPollCore';

interface DashboardLiveMetricsProps {
  connected: boolean;
  metrics: DashboardMetricsRaw;
}

function stateLabel(locale: import('../../i18n/messages').Locale, raw: string | null): string {
  if (!raw) return '—';
  const key = raw.trim();
  const label = axisStateLabel(locale, key);
  return label !== key ? `${key} · ${label}` : key;
}

export function DashboardLiveMetrics({ connected, metrics }: DashboardLiveMetricsProps) {
  const { state } = useAppState();
  const locale = state.locale;
  const emptyLabel = translate(locale, 'metricEmpty');

  const errorOk = useMemo(() => metricsErrorOk(metrics), [metrics]);
  const activeError = useMemo(() => firstActiveError(metrics), [metrics]);

  const rows: { labelKey: string; value: string | null; tone?: 'ok' | 'error' | 'warn' }[] = [
    {
      labelKey: 'metricVbus',
      value:
        metrics.vbusV === null ? null : `${metrics.vbusV.toFixed(1)} V`,
      tone:
        metrics.vbusV !== null && metrics.vbusV < VBUS_WARN_V
          ? 'warn'
          : undefined,
    },
    {
      labelKey: 'metricAxisState',
      value: connected ? stateLabel(locale, metrics.axisState) : null,
      tone:
        metrics.axisState === '8'
          ? 'ok'
          : metrics.axisState === '1'
            ? 'warn'
            : undefined,
    },
    {
      labelKey: 'metricIqMotor',
      value:
        metrics.iqA === null ? null : `${metrics.iqA.toFixed(2)} A`,
    },
    {
      labelKey: 'metricFetTemp',
      value: metrics.fetTempC === null ? null : `${metrics.fetTempC.toFixed(1)} °C`,
      tone:
        metrics.fetTempC !== null && metrics.fetTempC > 85
          ? 'error'
          : metrics.fetTempC !== null && metrics.fetTempC > 70
            ? 'warn'
            : metrics.fetTempC !== null
              ? 'ok'
              : undefined,
    },
    ...(metrics.motorTempC !== null
      ? [
          {
            labelKey: 'metricMotorTemp',
            value: `${metrics.motorTempC.toFixed(1)} °C`,
            tone:
              metrics.motorTempC > 85
                ? ('error' as const)
                : metrics.motorTempC > 70
                  ? ('warn' as const)
                  : ('ok' as const),
          },
        ]
      : []),
    {
      labelKey: 'metricErrors',
      value:
        errorOk === null
          ? null
          : errorOk
            ? translate(locale, 'metricErrorsOk')
            : activeError ?? translate(locale, 'metricErrorsActive'),
      tone: errorOk === null ? undefined : errorOk ? 'ok' : 'error',
    },
  ];

  return (
    <div className="dashboard-metrics">
      {rows.map((row) => (
        <MetricRow
          key={row.labelKey}
          label={translate(locale, row.labelKey)}
          value={row.value}
          tone={row.tone}
          emptyLabel={emptyLabel}
        />
      ))}
    </div>
  );
}

function MetricRow({
  label,
  value,
  tone,
  emptyLabel,
}: {
  label: string;
  value: string | null;
  tone?: 'ok' | 'error' | 'warn';
  emptyLabel: string;
}) {
  const color =
    tone === 'ok' ? 'var(--ok)'
    : tone === 'error' ? 'var(--error)'
    : tone === 'warn' ? 'var(--warn)'
    : 'var(--text)';

  return (
    <div className="dashboard-metric-row">
      <span className="dashboard-metric-label">{label}</span>
      <strong className="dashboard-metric-value" style={{ color }}>
        {value ?? emptyLabel}
      </strong>
    </div>
  );
}
