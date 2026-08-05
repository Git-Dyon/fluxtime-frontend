import React, { useCallback, useEffect, useState } from 'react';
import { TitleBar } from '../components/TitleBar';
import { Avatar } from '../components/Avatar';
import { BottomSheet } from '../components/BottomSheet';
import { api, clearToken } from '../lib/api';
import { Task, User } from '../lib/types';
import { useNow } from '../hooks/useNow';
import { calcTotalSeconds, deadlineClass, deadlineLabel, formatSeconds, formatHM, severidadeColor } from '../lib/utils';
import styles from './User.module.css';

interface Props { user: User; onLogout: () => void; }
type Aba = 'inicio' | 'tasks';
const USER_STATUS = ['Back Log','Atuando','Em testes','Liberado para QA','Deploy'] as const;

export function User({ user, onLogout }: Props) {
  const now = useNow();
  const [aba, setAba] = useState<Aba>('inicio');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState<boolean>(false);

  // Quick task
  const [quickTitle, setQuickTitle] = useState('');

  // Manual launch
  const [manualInicio, setManualInicio] = useState<Record<string, string>>({});
  const [manualFim, setManualFim] = useState<Record<string, string>>({});

  // Nova task form (completa)
  const [fTitulo, setFTitulo] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fEmpresa, setFEmpresa] = useState('');
  const [fProjeto, setFProjeto] = useState('');
  const [fHoras, setFHoras] = useState('2');
  const [fData, setFData] = useState('');
  const [fSev, setFSev] = useState<Task['severidade']>('Baixa');
  const [criando, setCriando] = useState(false);

  const load = useCallback(async () => {
    const t = await api.get<Task[]>(`/tasks?userId=${user.id}`);
    setTasks(t);
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const totalDia = tasks.reduce((s, t) => s + calcTotalSeconds(t, now), 0);
  const focoTask = tasks.find(t => t.rodando);
  const ordenadas = [...tasks].sort((a, b) => {
    const sevOrder = { Crítica: 4, Alta: 3, Média: 2, Baixa: 1 };
    const diff = sevOrder[b.severidade] - sevOrder[a.severidade];
    if (diff !== 0) return diff;
    return new Date(a.dataFinal).getTime() - new Date(b.dataFinal).getTime();
  });

  const handleStart = async (id: string) => {
    await api.post(`/tasks/${id}/start`, {});
    await load();
  };

  const handleStop = async (id: string) => {
    await api.post(`/tasks/${id}/stop`, {});
    await load();
  };

  const handleStatusChange = async (id: string, status: Task['status']) => {
    await api.put(`/tasks/${id}`, { status });
    await load();
  };

  const handleManual = async (id: string) => {
    const ini = manualInicio[id] || '';
    const fim = manualFim[id] || '';
    if (!ini || !fim) return;
    await api.post(`/tasks/${id}/manual`, { inicio: ini, fim });
    setManualInicio(m => ({ ...m, [id]: '' }));
    setManualFim(m => ({ ...m, [id]: '' }));
    await load();
  };

  const handleQuickTask = async () => {
    if (!quickTitle.trim()) return;
    setCriando(true);
    try {
      const today = new Date(); today.setDate(today.getDate() + 7);
      const t = await api.post<Task>('/tasks', {
        titulo: quickTitle, userId: user.id, status: 'Atuando',
        severidade: 'Baixa', horas: 1,
        dataFinal: today.toISOString().split('T')[0],
      });
      setQuickTitle('');
      await api.post(`/tasks/${t.id}/start`, {});
      await load();
    } finally { setCriando(false); }
  };

  const handleCriarDetalhada = async () => {
    if (!fTitulo.trim()) return;
    setCriando(true);
    try {
      const today = new Date(); today.setDate(today.getDate() + 7);
      await api.post('/tasks', {
        titulo: fTitulo, descricao: fDesc, empresa: fEmpresa, projeto: fProjeto,
        horas: parseFloat(fHoras) || 1, dataFinal: fData || today.toISOString().split('T')[0],
        severidade: fSev, status: 'Back Log', userId: user.id,
      });
      setSheet(false);
      setFTitulo(''); setFDesc(''); setFEmpresa(''); setFProjeto('');
      await load();
    } finally { setCriando(false); }
  };

  const statusColors: Record<string, string> = { green: 'var(--fx-green)', yellow: 'var(--fx-yellow)', orange: 'var(--fx-orange)', red: 'var(--fx-red)' };

  return (
    <>
      <TitleBar />

      {/* Cabeçalho */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Avatar nome={user.nome} size={44} />
          <div>
            <span className={styles.perfil}>Usuário</span>
            <div className={styles.nome}>{user.nome}</div>
          </div>
        </div>
        <div className={styles.hojeArea}>
          <span className={styles.hojeLabel}>Hoje</span>
          <span className={`${styles.hojeTotal} fx-tabular`}>{formatHM(totalDia)}</span>
        </div>
      </div>

      {/* Scroll */}
      <div className={styles.scrollArea}>
        {aba === 'inicio' && (
          <>
            {/* Criar task */}
            <div className={styles.createCard}>
              <div className={styles.createTop}>
                <span className={styles.createLabel}>Criar minha task</span>
                <span className={styles.createSub}>Somente para mim</span>
              </div>
              <div className={styles.createRow}>
                <div className="fx-field" style={{ flex: 1 }}>
                  <input
                    placeholder="No que você vai trabalhar?"
                    value={quickTitle}
                    onChange={e => setQuickTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleQuickTask()}
                  />
                </div>
                <button className={styles.playBtn} onClick={handleQuickTask} disabled={criando}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M5 3l8 5-8 5V3z" fill="var(--fx-accent)" />
                  </svg>
                </button>
              </div>
              <button className={styles.detalhesBtn} onClick={() => setSheet(true)}>+ Detalhar task completa</button>
            </div>

            {/* Em execução */}
            <div className={styles.execLabel}>Em execução</div>
            {focoTask ? (
              <div className={styles.focoCard}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                  <div className={`fx-dot ${deadlineClass(focoTask.dataFinal, focoTask.status)}`} style={{ marginTop: 3 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fx-text-1)', lineHeight: 1.3 }}>{focoTask.titulo}</div>
                    {focoTask.empresa && <div style={{ fontSize: 10, color: 'var(--fx-text-3)', marginTop: 2 }}>{focoTask.empresa} · {focoTask.projeto}</div>}
                  </div>
                  <span className="fx-chip">{focoTask.status}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span className={`${styles.focoClock} fx-tabular`}>{formatSeconds(calcTotalSeconds(focoTask, now))}</span>
                  <button
                    className={`${styles.playBtnLg} ${focoTask.rodando ? styles.playing : ''}`}
                    onClick={() => focoTask.rodando ? handleStop(focoTask.id) : handleStart(focoTask.id)}
                  >
                    {focoTask.rodando ? (
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <rect x="3" y="3" width="4" height="12" rx="1" fill="var(--fx-accent)" />
                        <rect x="11" y="3" width="4" height="12" rx="1" fill="var(--fx-accent)" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M5 3l10 6-10 6V3z" fill="var(--fx-accent)" />
                      </svg>
                    )}
                  </button>
                </div>

                <div className="fx-progress-track" style={{ margin: '10px 0 6px' }}>
                  <div className="fx-progress-fill" style={{
                    width: `${Math.min(100, (calcTotalSeconds(focoTask, now) / (focoTask.horas * 3600)) * 100)}%`,
                    background: statusColors[deadlineClass(focoTask.dataFinal, focoTask.status)]
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--fx-text-3)' }}>
                  <span>Restam {formatHM(Math.max(0, focoTask.horas * 3600 - calcTotalSeconds(focoTask, now)))} de execução</span>
                  <span>{deadlineLabel(focoTask.dataFinal)}</span>
                </div>
              </div>
            ) : (
              <div className={styles.semFoco}>
                <p>Nenhuma task em execução</p>
                <span>Inicie uma task na aba Minhas tasks</span>
              </div>
            )}
          </>
        )}

        {aba === 'tasks' && (
          <>
            <div className={styles.taskHeader} style={{ paddingTop: 16 }}>
              <span className={styles.sectionTitle}>Minhas tasks</span>
              <span className={styles.sectionCount}>Por severidade</span>
            </div>
            {ordenadas.length === 0 ? (
              <p className={styles.vazio}>Nenhuma task atribuída.</p>
            ) : ordenadas.map(t => {
              const total = calcTotalSeconds(t, now);
              const dlClass = deadlineClass(t.dataFinal, t.status);
              const progress = Math.min(100, (total / (t.horas * 3600)) * 100);

              return (
                <div key={t.id} className={styles.taskCard} onClick={() => setAbertos(a => ({ ...a, [t.id]: !a[t.id] }))}>
                  <div className={`fx-dot ${dlClass}`} style={{ position: 'absolute', top: 14, left: 14, boxShadow: '0 0 0 3px rgba(255,255,255,0.6)' }} />
                  <div style={{ paddingLeft: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fx-text-1)', lineHeight: 1.3 }}>{t.titulo}</div>
                        {t.empresa && <div style={{ fontSize: 10, color: 'var(--fx-text-3)', marginTop: 2 }}>{t.empresa} · {t.projeto}</div>}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <span className={`fx-chip`} style={{ color: statusColors[severidadeColor(t.severidade)] }}>
                          <span className={`fx-dot ${severidadeColor(t.severidade)}`} />{t.severidade}
                        </span>
                        <span className="fx-chip">{t.status}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 10.5, color: 'var(--fx-text-3)' }}>
                      <span>{deadlineLabel(t.dataFinal)}</span>
                      <span className={`fx-tabular`} style={{ fontSize: 12, fontWeight: 700, color: t.rodando ? 'var(--fx-accent)' : 'var(--fx-text-2)' }}>
                        {formatSeconds(total)}
                      </span>
                    </div>

                    {abertos[t.id] && (
                      <div style={{ marginTop: 12 }} onClick={e => e.stopPropagation()}>
                        <hr className="fx-divider" style={{ marginBottom: 10 }} />
                        {t.descricao && <p style={{ fontSize: 12, color: 'var(--fx-text-2)', lineHeight: 1.6, marginBottom: 10 }}>{t.descricao}</p>}

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                          <span className="fx-chip">{t.id}</span>
                          <span className="fx-chip">{t.horas}h estimadas</span>
                          <span className="fx-chip">Entrega {new Date(t.dataFinal).toLocaleDateString('pt-BR')}</span>
                          {t.anexos.length > 0 && <span className="fx-chip">📎 {t.anexos.length}</span>}
                        </div>

                        <div className="fx-progress-track" style={{ marginBottom: 4 }}>
                          <div className="fx-progress-fill" style={{ width: `${progress}%`, background: statusColors[dlClass] }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--fx-text-3)', marginBottom: 12 }}>
                          <span>Restam {formatHM(Math.max(0, t.horas * 3600 - total))}</span>
                          <span>{t.creator ? `Criada por ${t.creator.nome.split(' ')[0]}` : 'Criada por mim'}</span>
                        </div>

                        {/* Status (sem Concluído) */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                          {USER_STATUS.map(s => (
                            <button key={s} className={`fx-chip ${t.status === s ? 'active' : ''}`} onClick={() => handleStatusChange(t.id, s)}>{s}</button>
                          ))}
                        </div>
                        <p style={{ fontSize: 10, color: 'var(--fx-text-4)', marginBottom: 10, fontStyle: 'italic' }}>
                          O status Concluído é aplicado apenas pelo gerente.
                        </p>

                        {/* Play/Pause */}
                        <button
                          className="fx-btn-pill"
                          style={{ width: '100%', marginBottom: 12 }}
                          onClick={() => t.rodando ? handleStop(t.id) : handleStart(t.id)}
                        >
                          {t.rodando ? '⏸ Pausar execução' : '▶ Iniciar execução'}
                        </button>

                        {/* Lançamento manual */}
                        <div style={{ background: 'var(--fx-surface)', borderRadius: 16, padding: '12px 14px', boxShadow: 'var(--shadow-inset-field)' }}>
                          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.6, textTransform: 'uppercase', color: 'var(--fx-text-3)', display: 'block', marginBottom: 10 }}>
                            Lançamento manual
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="time" value={manualInicio[t.id] || ''} onChange={e => setManualInicio(m => ({ ...m, [t.id]: e.target.value }))}
                              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--fx-text-input)', fontFamily: 'var(--font)' }} />
                            <span style={{ fontSize: 12, color: 'var(--fx-text-3)' }}>até</span>
                            <input type="time" value={manualFim[t.id] || ''} onChange={e => setManualFim(m => ({ ...m, [t.id]: e.target.value }))}
                              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--fx-text-input)', fontFamily: 'var(--font)' }} />
                            <button className="fx-btn-sq" style={{ flexShrink: 0 }} onClick={() => handleManual(t.id)}>
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6.3 4.7 9 10 3.2" stroke="var(--fx-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}

        <div style={{ height: 80 }} />
      </div>

      {/* Navbar */}
      <div className={styles.navbar}>
        <div className={`${styles.navItem} ${aba === 'inicio' ? styles.navActive : ''}`} onClick={() => setAba('inicio')}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M3 10L10 3l7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 8.5V17h4v-4h2v4h4V8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Início</span>
        </div>
        <div className={`${styles.navItem} ${aba === 'tasks' ? styles.navActive : ''}`} onClick={() => setAba('tasks')}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Minhas tasks</span>
        </div>
      </div>

      {/* Sheet: task detalhada */}
      {sheet && (
        <BottomSheet onClose={() => setSheet(false)} title="Detalhar task">
          <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <span className={styles.fieldLabel}>Título *</span>
              <div className="fx-field" style={{ marginTop: 6 }}>
                <input placeholder="Título da task" value={fTitulo} onChange={e => setFTitulo(e.target.value)} />
              </div>
            </div>
            <div>
              <span className={styles.fieldLabel}>Descrição</span>
              <div className="fx-field" style={{ height: 'auto', padding: '10px 18px', marginTop: 6 }}>
                <textarea placeholder="Descrição…" value={fDesc} onChange={e => setFDesc(e.target.value)} rows={3} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <span className={styles.fieldLabel}>Empresa</span>
                <div className="fx-field" style={{ marginTop: 6 }}>
                  <input placeholder="Empresa" value={fEmpresa} onChange={e => setFEmpresa(e.target.value)} />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <span className={styles.fieldLabel}>Projeto</span>
                <div className="fx-field" style={{ marginTop: 6 }}>
                  <input placeholder="Projeto" value={fProjeto} onChange={e => setFProjeto(e.target.value)} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <span className={styles.fieldLabel}>Horas estimadas</span>
                <div className="fx-field" style={{ marginTop: 6 }}>
                  <input type="number" min="0.5" step="0.5" value={fHoras} onChange={e => setFHoras(e.target.value)} />
                  <span style={{ fontSize: 12, color: 'var(--fx-text-3)' }}>h</span>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <span className={styles.fieldLabel}>Data final</span>
                <div className="fx-field" style={{ marginTop: 6 }}>
                  <input type="date" value={fData} onChange={e => setFData(e.target.value)} />
                </div>
              </div>
            </div>
            <div>
              <span className={styles.fieldLabel}>Severidade</span>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {(['Baixa', 'Média', 'Alta', 'Crítica'] as const).map(s => (
                  <button key={s} className={`fx-chip ${fSev === s ? 'active' : ''}`} onClick={() => setFSev(s)}>
                    <span className={`fx-dot ${severidadeColor(s)}`} />{s}
                  </button>
                ))}
              </div>
            </div>
            <button
              className="fx-btn-pill"
              style={{ width: '100%', height: 50, fontSize: 14, marginTop: 4 }}
              onClick={handleCriarDetalhada}
              disabled={criando || !fTitulo.trim()}
            >
              {criando ? <div className="fx-spinner" /> : 'Criar task'}
            </button>
          </div>
        </BottomSheet>
      )}
    </>
  );
}
