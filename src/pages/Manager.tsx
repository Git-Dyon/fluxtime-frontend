import React, { useCallback, useEffect, useState } from 'react';
import { TitleBar } from '../components/TitleBar';
import { Avatar } from '../components/Avatar';
import { BottomSheet } from '../components/BottomSheet';
import { api, clearToken } from '../lib/api';
import { Task, User } from '../lib/types';
import { useNow } from '../hooks/useNow';
import {
  calcTotalSeconds, deadlineClass, deadlineLabel,
  formatSeconds, formatHM, severidadeColor
} from '../lib/utils';
import styles from './Manager.module.css';

interface Props { user: User; onLogout: () => void; }
type Sheet = null | 'equipe' | 'monitor' | 'nova';
type Aba = 'inicio' | 'tasks';
const ALL_STATUS = ['Back Log','Atuando','Em testes','Liberado para QA','Deploy','Concluído'] as const;

export function Manager({ user, onLogout }: Props) {
  const now = useNow();
  const [aba, setAba] = useState<Aba>('inicio');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [equipe, setEquipe] = useState<User[]>([]);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [filtro, setFiltro] = useState<string>('Todas');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [monitorId, setMonitorId] = useState<string>('');

  // Minha atividade
  const [meuTitulo, setMeuTitulo] = useState('');
  const [meuRodando, setMeuRodando] = useState(false);
  const [meuSegundos, setMeuSegundos] = useState(0);
  const [meuInicio, setMeuInicio] = useState<number | null>(null);

  // Nova task form
  const [fTitulo, setFTitulo] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fEmpresa, setFEmpresa] = useState('');
  const [fProjeto, setFProjeto] = useState('');
  const [fHoras, setFHoras] = useState('4');
  const [fData, setFData] = useState('');
  const [fSev, setFSev] = useState<Task['severidade']>('Média');
  const [fUserId, setFUserId] = useState('');
  const [fStatus, setFStatus] = useState<Task['status']>('Back Log');
  const [criando, setCriando] = useState(false);

  const load = useCallback(async () => {
    const [t, e] = await Promise.all([
      api.get<Task[]>(`/tasks?gerenteId=${user.id}`),
      api.get<User[]>(`/users/team/${user.id}`),
    ]);
    setTasks(t);
    setEquipe(e);
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const meuTotal = meuSegundos + (meuRodando && meuInicio ? Math.floor((now - meuInicio) / 1000) : 0);

  const toggleMeu = () => {
    if (!meuRodando) {
      setMeuRodando(true);
      setMeuInicio(Date.now());
    } else {
      const elapsed = meuInicio ? Math.floor((Date.now() - meuInicio) / 1000) : 0;
      setMeuSegundos(s => s + elapsed);
      setMeuRodando(false);
      setMeuInicio(null);
    }
  };

  const toggleTask = (id: string) => setAbertos(a => ({ ...a, [id]: !a[id] }));

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

  const handleDelete = async (id: string) => {
    await api.delete(`/tasks/${id}`);
    await load();
  };

  const handleCriarTask = async () => {
    if (!fTitulo.trim()) return;
    setCriando(true);
    try {
      await api.post('/tasks', {
        titulo: fTitulo, descricao: fDesc, empresa: fEmpresa, projeto: fProjeto,
        horas: parseFloat(fHoras) || 1, dataFinal: fData,
        severidade: fSev, status: fStatus, userId: fUserId || null,
      });
      setSheet(null);
      setFTitulo(''); setFDesc(''); setFEmpresa(''); setFProjeto('');
      setFHoras('4'); setFData(''); setFSev('Média'); setFUserId(''); setFStatus('Back Log');
      await load();
    } finally { setCriando(false); }
  };

  const ativas = tasks.filter(t => t.status !== 'Back Log' && t.status !== 'Concluído');
  const filtradas = filtro === 'Todas' ? tasks : tasks.filter(t => t.status === filtro);
  const monitorUser = equipe.find(e => e.id === monitorId);
  const monitorTasks = tasks.filter(t => t.userId === monitorId);
  const monitorAtiva = monitorTasks.find(t => t.rodando);

  return (
    <>
      <TitleBar />

      {/* Cabeçalho */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Avatar nome={user.nome} size={44} />
          <div>
            <span className={styles.perfil}>Gerente</span>
            <div className={styles.nome}>{user.nome}</div>
          </div>
        </div>
        <button className={styles.equipeBtn} onClick={() => setSheet('equipe')}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1.8"/>
            <circle cx="14" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.6"/>
            <path d="M2 17c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M14 11c2.2 0 4 1.8 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          <span>Equipe</span>
        </button>
      </div>

      {/* Conteúdo scrollável */}
      <div className={styles.scrollArea}>
        {aba === 'inicio' && (
          <>
            {/* Minha atividade */}
            <div className={styles.activityCard}>
              <div className={styles.activityTop}>
                <span className={styles.activityLabel}>Minha atividade</span>
                <span className={styles.activityStatus}>{meuRodando ? 'Cronômetro ativo' : 'Cronômetro parado'}</span>
              </div>
              <div className={styles.activityRow}>
                <div className="fx-field" style={{ flex: 1 }}>
                  <input
                    placeholder="No que você está trabalhando?"
                    value={meuTitulo}
                    onChange={e => setMeuTitulo(e.target.value)}
                  />
                </div>
                <button
                  className={`${styles.playBtn} ${meuRodando ? styles.playing : ''}`}
                  onClick={toggleMeu}
                >
                  {meuRodando ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <rect x="3" y="3" width="3.5" height="10" rx="1" fill="var(--fx-accent)"/>
                      <rect x="9.5" y="3" width="3.5" height="10" rx="1" fill="var(--fx-accent)"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M5 3l8 5-8 5V3z" fill="var(--fx-accent)"/>
                    </svg>
                  )}
                </button>
              </div>
              <div className={styles.timerRow}>
                <span className={`${styles.timer} fx-tabular`}>{formatSeconds(meuTotal)}</span>
                <span className={styles.timerSub}>hoje · {formatHM(meuTotal)}</span>
              </div>
            </div>

            {/* Tasks em andamento */}
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>Tasks em andamento</span>
              <span className={styles.sectionCount}>{ativas.length} de {tasks.length}</span>
            </div>
            {ativas.length === 0
              ? <p className={styles.vazio}>Nenhuma task ativa no momento.</p>
              : ativas.map(t => <TaskCard key={t.id} task={t} now={now} aberta={!!abertos[t.id]} onToggle={toggleTask}
                  onStart={handleStart} onStop={handleStop} onStatus={handleStatusChange} onDelete={handleDelete} isManager />)
            }
          </>
        )}

        {aba === 'tasks' && (
          <>
            <div className={styles.sectionHeader} style={{ marginTop: 0, paddingTop: 16 }}>
              <span className={styles.sectionTitle}>Todas as tasks</span>
              <span className={styles.sectionCount}>{tasks.length} tasks</span>
            </div>
            {/* Filtros */}
            <div className={styles.filtros}>
              {['Todas', ...ALL_STATUS].map(f => (
                <button
                  key={f}
                  className={`fx-chip ${filtro === f ? 'active' : ''}`}
                  onClick={() => setFiltro(f)}
                >
                  {f}
                </button>
              ))}
            </div>
            {filtradas.length === 0
              ? <p className={styles.vazio}>Nenhuma task neste status.</p>
              : filtradas.map(t => <TaskCard key={t.id} task={t} now={now} aberta={!!abertos[t.id]} onToggle={toggleTask}
                  onStart={handleStart} onStop={handleStop} onStatus={handleStatusChange} onDelete={handleDelete} isManager />)
            }
          </>
        )}

        <div style={{ height: 90 }} />
      </div>

      {/* Navbar */}
      <div className={styles.navbar}>
        <div className={`${styles.navItem} ${aba === 'inicio' ? styles.navActive : ''}`} onClick={() => setAba('inicio')}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M3 10L10 3l7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M5 8.5V17h4v-4h2v4h4V8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Início</span>
        </div>
        <div className={`${styles.navItem} ${aba === 'tasks' ? styles.navActive : ''}`} onClick={() => setAba('tasks')}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Tasks</span>
        </div>
      </div>

      {/* FAB nova task (só na aba tasks) */}
      {aba === 'tasks' && (
        <button className="fx-fab" style={{ right: 26, bottom: 104 }} onClick={() => setSheet('nova')}>+</button>
      )}

      {/* Sheet: Equipe */}
      {sheet === 'equipe' && (
        <BottomSheet onClose={() => setSheet(null)} title="Monitorar equipe">
          <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {equipe.map(e => {
              const taskAtiva = tasks.find(t => t.userId === e.id && t.rodando);
              const totalDia = tasks.filter(t => t.userId === e.id).reduce((s, t) => s + calcTotalSeconds(t, now), 0);
              return (
                <div key={e.id} className={styles.equipeRow} onClick={() => { setMonitorId(e.id); setSheet('monitor'); }}>
                  <Avatar nome={e.nome} size={40} />
                  <div style={{ flex: 1 }}>
                    <div className={styles.membroNome}>{e.nome}</div>
                    <div style={{ fontSize: 11, color: taskAtiva ? 'var(--fx-green)' : 'var(--fx-text-4)' }}>
                      {taskAtiva ? `Atuando · ${taskAtiva.titulo}` : 'Sem task ativa'}
                    </div>
                  </div>
                  <span className={`${styles.membroHoras} fx-tabular`}>{formatHM(totalDia)}</span>
                </div>
              );
            })}
            {equipe.length === 0 && <p className={styles.vazio}>Nenhum usuário na equipe.</p>}
          </div>
        </BottomSheet>
      )}

      {/* Sheet: Monitor individual */}
      {sheet === 'monitor' && monitorUser && (
        <div className="fx-overlay" onClick={() => setSheet('equipe')}>
          <div style={{ width: '100%', height: '100%', background: 'rgba(231,234,239,0.86)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', padding: 26 }} onClick={e => e.stopPropagation()}>
            <button className={styles.backBtn} onClick={() => setSheet('equipe')}>← Voltar</button>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 24 }}>
              <Avatar nome={monitorUser.nome} size={46} />
              <div className={styles.nome}>{monitorUser.nome}</div>
              <div className={styles.perfil}>{monitorUser.cargo}</div>
            </div>
            {monitorAtiva ? (
              <div className={styles.monitorCard}>
                <span className={styles.equipeLabel}>Atuando agora</span>
                <div className={styles.monitorTitulo}>{monitorAtiva.titulo}</div>
                <div className={`${styles.monitorTimer} fx-tabular`}>{formatSeconds(calcTotalSeconds(monitorAtiva, now))}</div>
              </div>
            ) : (
              <div className={styles.monitorCard} style={{ textAlign: 'center' }}>
                <p style={{ color: 'var(--fx-text-4)', fontSize: 13 }}>Sem task em execução</p>
              </div>
            )}
            <div style={{ marginTop: 20 }}>
              <span className={styles.equipeLabel}>Tasks vinculadas</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                {monitorTasks.map(t => (
                  <div key={t.id} className={styles.monitorTask}>
                    <div className={`fx-dot ${deadlineClass(t.dataFinal, t.status)}`} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fx-text-1)' }}>{t.titulo}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--fx-text-3)' }}>{t.status} · {deadlineLabel(t.dataFinal)}</div>
                    </div>
                    <span className={`fx-tabular`} style={{ fontSize: 12, color: t.rodando ? 'var(--fx-accent)' : 'var(--fx-text-2)' }}>
                      {formatSeconds(calcTotalSeconds(t, now))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sheet: Nova task */}
      {sheet === 'nova' && (
        <BottomSheet onClose={() => setSheet(null)} title="Nova task">
          <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <span className={styles.fieldLabel}>ID</span>
              <div className="fx-field" style={{ opacity: 0.6, marginTop: 6 }}>
                <input value="FX-AUTO" readOnly />
              </div>
            </div>
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
                {(['Baixa','Média','Alta','Crítica'] as const).map(s => (
                  <button key={s} className={`fx-chip ${fSev === s ? 'active' : ''}`} onClick={() => setFSev(s)}>
                    <span className={`fx-dot ${severidadeColor(s)}`} />{s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className={styles.fieldLabel}>Vincular usuário</span>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {equipe.map(e => (
                  <div
                    key={e.id}
                    style={{ textAlign: 'center', cursor: 'pointer' }}
                    onClick={() => setFUserId(fUserId === e.id ? '' : e.id)}
                  >
                    <Avatar nome={e.nome} size={46} inset={fUserId === e.id} />
                    {fUserId === e.id && (
                      <div style={{ fontSize: 9, color: 'var(--fx-accent)', marginTop: 3, fontWeight: 600 }}>
                        {e.nome.split(' ')[0]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <span className={styles.fieldLabel}>Status inicial</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {ALL_STATUS.map(s => (
                  <button key={s} className={`fx-chip ${fStatus === s ? 'active' : ''}`} onClick={() => setFStatus(s)}>{s}</button>
                ))}
              </div>
            </div>
            <button
              className="fx-btn-pill"
              style={{ width: '100%', height: 50, fontSize: 14, marginTop: 4 }}
              onClick={handleCriarTask}
              disabled={criando || !fTitulo.trim()}
            >
              {criando ? <div className="fx-spinner" /> : 'Criar e direcionar task'}
            </button>
          </div>
        </BottomSheet>
      )}
    </>
  );
}

// ─── TaskCard inline component ──────────────────────────────────────────────
interface TaskCardProps {
  task: Task; now: number; aberta: boolean;
  onToggle: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onStatus: (id: string, s: Task['status']) => void;
  onDelete: (id: string) => void;
  isManager: boolean;
}

function TaskCard({ task, now, aberta, onToggle, onStart, onStop, onStatus, onDelete, isManager }: TaskCardProps) {
  const total = calcTotalSeconds(task, now);
  const dlClass = deadlineClass(task.dataFinal, task.status);
  const progress = Math.min(100, (total / (task.horas * 3600)) * 100);
  const restam = Math.max(0, task.horas * 3600 - total);

  const statusColors: Record<string, string> = { 'green': 'var(--fx-green)', 'yellow': 'var(--fx-yellow)', 'orange': 'var(--fx-orange)', 'red': 'var(--fx-red)' };

  const statusList = isManager
    ? ['Back Log','Atuando','Em testes','Liberado para QA','Deploy','Concluído'] as const
    : ['Back Log','Atuando','Em testes','Liberado para QA','Deploy'] as const;

  return (
    <div className={styles.taskCard} onClick={() => onToggle(task.id)}>
      <div className={`fx-dot ${dlClass}`} style={{ position: 'absolute', top: 14, left: 14, boxShadow: `0 0 0 3px rgba(255,255,255,0.6)` }} />
      <div style={{ paddingLeft: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fx-text-1)', lineHeight: 1.3 }}>{task.titulo}</div>
            {task.empresa && <div style={{ fontSize: 10, color: 'var(--fx-text-3)', marginTop: 2 }}>{task.empresa} · {task.projeto}</div>}
          </div>
          <span className="fx-chip">{task.status}</span>
        </div>

        {task.user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
            <Avatar nome={task.user.nome} size={28} inset />
            <span style={{ fontSize: 13, color: 'var(--fx-text-2)', flex: 1 }}>{task.user.nome}</span>
            <span className={`fx-tabular`} style={{ fontSize: 13, fontWeight: 700, color: task.rodando ? 'var(--fx-accent)' : 'var(--fx-text-2)' }}>
              {formatSeconds(total)}
            </span>
          </div>
        )}

        <div className="fx-progress-track" style={{ margin: '8px 0 4px' }}>
          <div className="fx-progress-fill" style={{ width: `${progress}%`, background: statusColors[dlClass] }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--fx-text-3)' }}>
          <span>Restam {formatHM(restam)} de execução</span>
          <span>{deadlineLabel(task.dataFinal)}</span>
        </div>

        {aberta && (
          <div style={{ marginTop: 12 }} onClick={e => e.stopPropagation()}>
            <hr className="fx-divider" style={{ marginBottom: 10 }} />
            {task.descricao && <p style={{ fontSize: 12, color: 'var(--fx-text-2)', lineHeight: 1.6, marginBottom: 10 }}>{task.descricao}</p>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              <span className="fx-chip">{task.id}</span>
              <span className={`fx-chip`} style={{ color: statusColors[severidadeColor(task.severidade)] }}><span className={`fx-dot ${severidadeColor(task.severidade)}`} />{task.severidade}</span>
              <span className="fx-chip">{task.horas}h estimadas</span>
              {task.anexos.length > 0 && <span className="fx-chip">📎 {task.anexos.length}</span>}
            </div>

            {isManager && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {statusList.map(s => (
                  <button key={s} className={`fx-chip ${task.status === s ? 'active' : ''}`} onClick={() => onStatus(task.id, s)}>{s}</button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="fx-btn-pill"
                style={{ flex: 1 }}
                onClick={() => task.rodando ? onStop(task.id) : onStart(task.id)}
              >
                {task.rodando ? '⏸ Pausar' : '▶ Iniciar'}
              </button>
              <button className="fx-btn-sq danger" style={{ width: 44, height: 44, borderRadius: 12 }} onClick={() => onDelete(task.id)}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M3 5h10M6 5V3h4v2M6 7v5M10 7v5M4 5l1 8h6l1-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
