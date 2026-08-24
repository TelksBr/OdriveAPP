import { useEffect, useMemo, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { Card } from '../../shared/ui';
import {
  applyBootPersist,
  applyBootPreset,
  BOOT_FLAG_DEFS,
  parseBoolField,
  getBootPresetForArchitecture,
  detectEncoderArchitecture,
  type BootFlagDef,
  type BootPresetId,
  type EncoderArchitecture,
} from './calibrationBootPresets';
import { useBoardSave } from '../board/useBoardSave';
import { toast } from '../../shared/toastActions';

const groupTitleKey: Record<BootFlagDef['group'], string> = {
  precal: 'calBootGroupPrecal',
  startup: 'calBootGroupStartup',
  limits: 'calBootGroupLimits',
  index: 'calBootGroupIndex',
};

const groupOrder: BootFlagDef['group'][] = ['precal', 'startup', 'index', 'limits'];

function desiredFromState(path: string, fieldValues: Record<string, string>): boolean {
  return parseBoolField(fieldValues[path]);
}

export function BootFlagsPanel() {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const { saveAll, saveBadge } = useBoardSave();
  const [draft, setDraft] = useState<Record<string, boolean>>({});

  const detectedArch = detectEncoderArchitecture(state.fieldValues);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const def of BOOT_FLAG_DEFS) {
      next[def.path] = desiredFromState(def.path, state.fieldValues);
    }
    setDraft(next);
  }, [state.fieldValues]);

  const grouped = useMemo(() => {
    const map = new Map<BootFlagDef['group'], BootFlagDef[]>();
    for (const def of BOOT_FLAG_DEFS) {
      const list = map.get(def.group) ?? [];
      list.push(def);
      map.set(def.group, list);
    }
    return map;
  }, []);

  async function applyArchPreset(arch: EncoderArchitecture) {
    dispatch({ type: 'set-busy', busy: true });
    try {
      const entries = getBootPresetForArchitecture(arch);
      const { fail } = await applyBootPersist(entries, dispatch);
      if (fail === 0) {
        dispatch({ type: 'set-nvm-pending', pending: true });
        const toastKey =
          arch === 'incremental_no_z'
            ? 'encoderArchAppliedOptA'
            : arch === 'incremental_abz'
            ? 'encoderArchAppliedOptB'
            : 'encoderArchAppliedOptC';
        toast(dispatch, translate(locale, toastKey), 'ok');
      }
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function applyPreset(preset: BootPresetId) {
    dispatch({ type: 'set-busy', busy: true });
    try {
      const { ok, fail } = await applyBootPreset(preset, dispatch, state.fieldValues);
      dispatch({
        type: 'append-log',
        direction: fail === 0 ? 'info' : 'error',
        message: translate(
          locale,
          preset === 'persistReady' ? 'calBootPresetPersistOk' : 'calBootPresetAutoCalOk',
          { ok: String(ok), fail: String(fail) },
        ),
      });
      if (fail === 0) {
        dispatch({ type: 'set-nvm-pending', pending: true });
      }
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function applyDraft() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      const entries = BOOT_FLAG_DEFS.map((def) => ({
        path: def.path,
        labelKey: def.labelKey,
        value: draft[def.path] ?? false,
      }));
      const { ok, fail } = await applyBootPersist(entries, dispatch);
      dispatch({
        type: 'append-log',
        direction: fail === 0 ? 'info' : 'error',
        message: translate(locale, 'calBootApplied', { ok: String(ok), fail: String(fail) }),
      });
      if (fail === 0) {
        dispatch({ type: 'set-nvm-pending', pending: true });
      }
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  return (
    <Card title={translate(locale, 'calBootPanelTitle')} description={translate(locale, 'calBootPanelDesc')}>
      <p className="cal-boot-panel-note">{translate(locale, 'calBootPanelNote')}</p>

      <div className="cal-boot-presets" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        <button
          type="button"
          className={detectedArch === 'spi_absolute' ? 'ok' : ''}
          disabled={!state.connected || state.busy}
          onClick={() => void applyArchPreset('spi_absolute')}
          title="Opção C: pre_cal=true, startup_*=false, startup_closed_loop=true"
        >
          🚀 {translate(locale, 'encoderArchOptCTitle')}
        </button>
        <button
          type="button"
          className={detectedArch === 'incremental_abz' ? 'ok' : ''}
          disabled={!state.connected || state.busy}
          onClick={() => void applyArchPreset('incremental_abz')}
          title="Opção B: pre_cal=true, use_index=true, startup_encoder_index_search=true"
        >
          ⚡ {translate(locale, 'encoderArchOptBTitle')}
        </button>
        <button
          type="button"
          className={detectedArch === 'incremental_no_z' ? 'warn' : ''}
          disabled={!state.connected || state.busy}
          onClick={() => void applyArchPreset('incremental_no_z')}
          title="Opção A: pre_cal=false, startup_encoder_offset_calibration=true"
        >
          🔄 {translate(locale, 'encoderArchOptATitle')}
        </button>
        <button
          type="button"
          className="linkish"
          disabled={!state.connected || state.busy}
          onClick={() => void applyPreset('autoCalEveryBoot')}
          title="Re-calibra tudo a cada boot"
        >
          {translate(locale, 'calBootPresetAutoCal')}
        </button>
      </div>

      <div className="cal-boot-flags-table">
        {groupOrder.map((group) => {
          const defs = grouped.get(group);
          if (!defs?.length) {
            return null;
          }
          return (
            <div key={group} className="cal-boot-flags-group">
              <div className="cal-boot-flags-group-title">{translate(locale, groupTitleKey[group])}</div>
              {defs.map((def) => {
                const live = desiredFromState(def.path, state.fieldValues);
                const checked = draft[def.path] ?? live;
                const synced = checked === live;
                return (
                  <label key={def.path} className={`cal-boot-flag-row${synced ? '' : ' dirty'}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!state.connected || state.busy}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, [def.path]: event.target.checked }))
                      }
                    />
                    <span className="cal-boot-flag-label">{translate(locale, def.labelKey)}</span>
                    <code className="cal-boot-flag-path">{def.path}</code>
                    <span className="cal-boot-flag-live" title={translate(locale, 'calBootFlagLive')}>
                      {live ? 'true' : 'false'}
                    </span>
                  </label>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        <button type="button" disabled={!state.connected || state.busy} onClick={() => void applyDraft()}>
          {translate(locale, 'calBootApplyCustom')}
        </button>
        <button type="button" className="ok" disabled={!state.connected || state.busy} onClick={() => void saveAll()}>
          {translate(locale, 'calNvmSaveNow')}{saveBadge}
        </button>
        <span className="cal-boot-hint">{translate(locale, 'calBootSaveHint')}</span>
      </div>
    </Card>
  );
}
