import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { TimeLog } from '../lib/types';
import { formatHM } from '../lib/utils';
import styles from './TimeLogHistory.module.css';

interface Props {
  taskId: string;
  currentUserId: string;
  /** Gerente pode editar/excluir o lançamento de qualquer membro da equipe. */
  souGerente: boolean;
  /** Dispara depois de uma edição/exclusão bem-sucedida, para o card recarregar os totais. */
  onAlterado: () => void;
}

const ORIGEM_LABEL: Record<TimeLog['origem'], string> = {
  CRONOMETRO: 'Cronômetro',
  MANUAL: 'Lançamento manual',
  AJUSTE_GERENTE: 'Ajuste do gerente',
  AUTO_STOP: 'Parado automaticamente',
};

function paraDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatarPeriodo(inicio: string, fim: string | null): string {
  const i = new Date(inicio);
  const f = fim ? new Date(fim) : null;
  const dataStr = i.toLocaleDateString('pt-BR');
  const horaI = i.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const horaF = f ? f.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '…';
  return `${dataStr} · ${horaI} – ${horaF}`;
}

/**
 * Extrato de tempo de uma task, com edição e exclusão (G6).
 *
 * O dono corrige o próprio lançamento dentro de uma janela de dias; passado
 * isso, ou para editar o de outra pessoa, só o gerente — e a API exige
 * justificativa nesse caso, então o formulário só pede motivo quando faz sentido.
 */
export function TimeLogHistory({ taskId, currentUserId, souGerente, onAlterado }: Props) {
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [fInicio, setFInicio] = useState('');
  const [fFim, setFFim] = useState('');
  const [fMotivo, setFMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    try {
      const r = await api.get<TimeLog[]>(`/timelogs/tasks/${taskId}`);
      setLogs(r);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { void carregar(); }, [taskId]);

  const iniciarEdicao = (log: TimeLog) => {
    setEditandoId(log.id);
    setFInicio(paraDatetimeLocal(log.inicio));
    setFFim(log.fim ? paraDatetimeLocal(log.fim) : '');
    setFMotivo('');
    setErro('');
  };

  const salvarEdicao = async (log: TimeLog) => {
    if (!fInicio || !fFim) { setErro('Preencha início e fim.'); return; }
    const ehDeOutraPessoa = log.userId !== currentUserId;
    if (ehDeOutraPessoa && !fMotivo.trim()) { setErro('Informe o motivo do ajuste.'); return; }

    setSalvando(true);
    setErro('');
    try {
      await api.put(`/timelogs/${log.id}`, {
        inicio: new Date(fInicio).toISOString(),
        fim: new Date(fFim).toISOString(),
        ...(ehDeOutraPessoa ? { motivoAjuste: fMotivo.trim() } : {}),
      });
      setEditandoId(null);
      await carregar();
      onAlterado();
    } catch (e: any) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (log: TimeLog) => {
    try {
      await api.delete(`/timelogs/${log.id}`);
      await carregar();
      onAlterado();
    } catch (e: any) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível excluir.');
    }
  };

  if (carregando) return null;

  return (
    <div className={styles.wrap}>
      <span className={styles.label}>Histórico de lançamentos</span>
      {logs.length === 0 && <p className={styles.vazio}>Nenhum lançamento ainda.</p>}
      {logs.map((log) => {
        const podeMexer = log.userId === currentUserId || souGerente;
        if (editandoId === log.id) {
          return (
            <div key={log.id} className={styles.editForm}>
              <div className={styles.editRow}>
                <input type="datetime-local" value={fInicio} onChange={(e) => setFInicio(e.target.value)} />
                <input type="datetime-local" value={fFim} onChange={(e) => setFFim(e.target.value)} />
              </div>
              {log.userId !== currentUserId && (
                <div className={styles.editRow}>
                  <input placeholder="Motivo do ajuste" value={fMotivo} onChange={(e) => setFMotivo(e.target.value)} />
                </div>
              )}
              {erro && <span className={styles.erro}>{erro}</span>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="fx-btn-pill" style={{ flex: 1, height: 34, fontSize: 11.5 }} disabled={salvando} onClick={() => void salvarEdicao(log)}>
                  {salvando ? '...' : 'Salvar'}
                </button>
                <button className="fx-btn-pill" style={{ flex: 1, height: 34, fontSize: 11.5 }} onClick={() => setEditandoId(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          );
        }
        return (
          <div key={log.id} className={styles.row}>
            <div className={styles.info}>
              {formatarPeriodo(log.inicio, log.fim)}
              <span className={styles.meta}>
                {formatHM(log.segundos)} · {ORIGEM_LABEL[log.origem]}
                {log.motivoAjuste ? ` · ${log.motivoAjuste}` : ''}
              </span>
            </div>
            {podeMexer && (
              <div className={styles.actions}>
                <button className={styles.iconBtn} title="Editar" onClick={() => iniciarEdicao(log)}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
                  </svg>
                </button>
                <button className={styles.iconBtn} title="Excluir" onClick={() => void excluir(log)}>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path d="M3 5h10M6 5V3h4v2M6 7v5M10 7v5M4 5l1 8h6l1-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        );
      })}
      {erro && !editandoId && <span className={styles.erro}>{erro}</span>}
    </div>
  );
}
