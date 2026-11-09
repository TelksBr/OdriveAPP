import { useEffect, useState } from 'react';
import { nativeListPorts, type NativePortDetail } from './nativeSerialBridge';
import { AppIcon } from '../../shared/ui/AppIcon';
import { Pill } from '../../shared/ui';

interface PortPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelectPort: (portName: string) => Promise<void>;
  currentPort?: string | null;
  busy?: boolean;
}

export function PortPickerModal({
  open,
  onClose,
  onSelectPort,
  currentPort,
  busy,
}: PortPickerModalProps) {
  const [ports, setPorts] = useState<NativePortDetail[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scanPorts = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await nativeListPorts();
      setPorts(list);

      // Pre-select recommended port or previously saved port
      const saved = localStorage.getItem('wheelforge-selected-com-port');
      const recommended = list.find(
        (p) =>
          (p.vid === 0x1209 && p.pid === 0x0d40) ||
          (p.vid === 0x0483 && p.pid === 0x5740) ||
          p.product?.includes('ODrive') ||
          p.product?.includes('OpenFFBoard')
      );

      if (currentPort && list.some((p) => p.name === currentPort)) {
        setSelectedPort(currentPort);
      } else if (saved && list.some((p) => p.name === saved)) {
        setSelectedPort(saved);
      } else if (recommended) {
        setSelectedPort(recommended.name);
      } else if (list.length > 0) {
        // Prefer COM ports other than COM1 if available
        const nonCom1 = list.find((p) => p.name !== 'COM1');
        setSelectedPort(nonCom1 ? nonCom1.name : list[0].name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void scanPorts();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handleConnect = async () => {
    if (!selectedPort) return;
    localStorage.setItem('wheelforge-selected-com-port', selectedPort);
    await onSelectPort(selectedPort);
    onClose();
  };

  const isRecommended = (p: NativePortDetail) =>
    (p.vid === 0x1209 && p.pid === 0x0d40) ||
    (p.vid === 0x0483 && p.pid === 0x5740) ||
    Boolean(p.product?.includes('ODrive') || p.product?.includes('OpenFFBoard'));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        style={{ width: '560px', maxWidth: '95vw', padding: '24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Selecionar Dispositivo Serial</h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
              Escolha a porta COM conectada à sua base ODrive / OpenFFBoard
            </p>
          </div>
          <button
            type="button"
            className="topbar-refresh-btn"
            onClick={() => void scanPorts()}
            disabled={loading || busy}
            title="Escanear portas novamente"
          >
            <AppIcon id="icon-refresh" size={14} />
            {loading ? 'Buscando...' : 'Atualizar'}
          </button>
        </div>

        {error && (
          <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', marginBottom: '16px', fontSize: '13px', color: '#f87171' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto', marginBottom: '20px' }}>
          {ports.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--muted)' }}>
              <p style={{ margin: '0 0 8px', fontSize: '14px' }}>Nenhum dispositivo serial detectado.</p>
              <span style={{ fontSize: '12px' }}>Verifique se o cabo USB está conectado na placa ODrive e clique em Atualizar.</span>
            </div>
          )}

          {ports.map((p) => {
            const recommended = isRecommended(p);
            const isSelected = selectedPort === p.name;
            return (
              <div
                key={p.name}
                onClick={() => setSelectedPort(p.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: isSelected ? '1.5px solid var(--accent, #0ea5e9)' : '1px solid var(--border)',
                  background: isSelected ? 'rgba(14, 165, 233, 0.08)' : 'var(--surface-raised, rgba(255,255,255,0.02))',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="radio"
                    name="selected-port"
                    checked={isSelected}
                    onChange={() => setSelectedPort(p.name)}
                    style={{ cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ fontSize: '15px' }}>{p.name}</strong>
                      {recommended && (
                        <Pill tone="ok">
                          ⭐ ODrive / OpenFFBoard
                        </Pill>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                      {p.product || 'Porta de comunicação'} {p.manufacturer ? `(${p.manufacturer})` : ''}
                      {p.vid !== undefined && p.pid !== undefined && (
                        <span style={{ marginLeft: '6px', fontFamily: 'var(--mono)', opacity: 0.8 }}>
                          [{`0x${p.vid.toString(16).padStart(4, '0')}:0x${p.pid.toString(16).padStart(4, '0')}`}]
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {p.name === currentPort && (
                  <Pill tone="neutral">Ativa</Pill>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text)',
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="ok"
            onClick={() => void handleConnect()}
            disabled={!selectedPort || busy}
            style={{
              padding: '8px 20px',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: selectedPort && !busy ? 'pointer' : 'not-allowed',
            }}
          >
            {busy ? 'Conectando...' : `Conectar em ${selectedPort || '...'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

