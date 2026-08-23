import { useCallback, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { Card, Pill } from '../../shared/ui';
import {
  fetchMt6835Status,
  setMt6835Zero,
  burnMt6835Eeprom,
  readMt6835Register,
  writeMt6835Register,
  type Mt6835Status,
} from './mt6835Diagnostics';

export function Mt6835DiagnosticsPanel() {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const [status, setStatus] = useState<Mt6835Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eepromWait, setEepromWait] = useState(false);
  const [regAddr, setRegAddr] = useState('0x011');
  const [regVal, setRegVal] = useState('0x02');
  const [regResult, setRegResult] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!state.connected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMt6835Status();
      setStatus(res);
      if (!res) {
        setError(translate(locale, 'mt6835DiagUnavailable'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [locale, state.connected]);

  const handleZero = async () => {
    if (!state.connected) return;
    try {
      const res = await setMt6835Zero();
      dispatch({
        type: 'append-log',
        direction: res.includes('FAIL') ? 'error' : 'info',
        message: `MT6835 Zero: ${res}`,
      });
      await refresh();
    } catch (err) {
      dispatch({ type: 'append-log', direction: 'error', message: String(err) });
    }
  };

  const handleBurnEeprom = async () => {
    if (!state.connected) return;
    if (!window.confirm(translate(locale, 'mt6835EepromConfirm'))) return;

    setEepromWait(true);
    try {
      const res = await burnMt6835Eeprom();
      dispatch({
        type: 'append-log',
        direction: res.includes('FAIL') ? 'error' : 'info',
        message: `MT6835 EEPROM: ${res}`,
      });
      // Wait 6.5s as required by chip datasheet
      setTimeout(() => {
        setEepromWait(false);
        void refresh();
      }, 6500);
    } catch (err) {
      setEepromWait(false);
      dispatch({ type: 'append-log', direction: 'error', message: String(err) });
    }
  };

  const handleReadReg = async () => {
    if (!state.connected) return;
    try {
      const res = await readMt6835Register(regAddr);
      setRegResult(res);
    } catch (err) {
      setRegResult(`Error: ${String(err)}`);
    }
  };

  const handleWriteReg = async () => {
    if (!state.connected) return;
    try {
      const res = await writeMt6835Register(regAddr, regVal);
      setRegResult(res);
    } catch (err) {
      setRegResult(`Error: ${String(err)}`);
    }
  };

  return (
    <Card title={translate(locale, 'mt6835DiagTitle')} description={translate(locale, 'mt6835DiagDescription')}>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <button
          type="button"
          disabled={!state.connected || state.busy || loading || eepromWait}
          onClick={() => void refresh()}
        >
          {loading ? translate(locale, 'as5047DiagLoading') : translate(locale, 'as5047DiagRefresh')}
        </button>
        <button
          type="button"
          disabled={!state.connected || state.busy || eepromWait}
          onClick={() => void handleZero()}
        >
          {translate(locale, 'mt6835BtnZero')}
        </button>
        <button
          type="button"
          className="btn-danger"
          disabled={!state.connected || state.busy || eepromWait}
          onClick={() => void handleBurnEeprom()}
        >
          {eepromWait ? translate(locale, 'mt6835BurningWait') : translate(locale, 'mt6835BtnBurnEeprom')}
        </button>
        {error ? <Pill tone="error">{error}</Pill> : null}
      </div>

      {eepromWait && (
        <div style={{ marginBottom: 12 }}>
          <Pill tone="warn">{translate(locale, 'mt6835EepromWarningStrip')}</Pill>
        </div>
      )}

      <div className="as5047-diag-grid">
        <section>
          <h4 className="input-channel-config-title">{translate(locale, 'mt6835StatusTitle')}</h4>
          {status ? (
            <dl className="as5047-diag-list">
              <DiagRow label="boot CRC" value={status.boot === 1 ? 'OK (1)' : 'FAIL (0)'} />
              <DiagRow label="hyst0" value={status.hyst0 === 1 ? 'Zeroed (1)' : 'Default (0)'} />
              <DiagRow label="overspeed" value={status.overspeed === 0 ? 'Normal (0)' : 'Warning (1)'} />
              <DiagRow label="weakfield" value={status.weakfield === 0 ? 'Normal (0)' : 'Magnet too far (1)'} />
              <DiagRow label="undervolt" value={status.undervolt === 0 ? 'Normal (0)' : 'Undervolt (1)'} />
              <DiagRow label="autocal" value={status.cal} />
            </dl>
          ) : (
            <p className="as5047-diag-empty">{translate(locale, 'as5047DiagEmpty')}</p>
          )}
        </section>

        <section>
          <h4 className="input-channel-config-title">{translate(locale, 'mt6835RegTitle')}</h4>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={regAddr}
              onChange={(e) => setRegAddr(e.target.value)}
              placeholder="0x011"
              style={{ width: 80, padding: '4px 8px' }}
            />
            <button type="button" disabled={!state.connected} onClick={() => void handleReadReg()}>
              {translate(locale, 'mt6835ReadBtn')}
            </button>
            <input
              type="text"
              value={regVal}
              onChange={(e) => setRegVal(e.target.value)}
              placeholder="0x03"
              style={{ width: 60, padding: '4px 8px' }}
            />
            <button type="button" disabled={!state.connected} onClick={() => void handleWriteReg()}>
              {translate(locale, 'mt6835WriteBtn')}
            </button>
          </div>
          {regResult ? (
            <p style={{ fontFamily: 'monospace', fontSize: 13, margin: '4px 0' }}>{regResult}</p>
          ) : null}
        </section>
      </div>
    </Card>
  );
}

function DiagRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="as5047-diag-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
