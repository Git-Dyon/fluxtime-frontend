import { useCallback, useEffect, useState } from 'react';
import { TitleBar } from '../components/TitleBar';
import { Avatar } from '../components/Avatar';
import { BottomSheet } from '../components/BottomSheet';
import { EspeciaisBar } from '../components/EspeciaisBar';
import { TimeLogHistory } from '../components/TimeLogHistory';
import { RequisicoesSheet } from '../components/RequisicoesSheet';
import { RelatorioSheet } from '../components/RelatorioSheet';
import { api, ApiError, uploadFile, downloadFile } from '../lib/api';
import { subscribeTaskEvents } from '../lib/socket';
import type { PaginaDeTasks, Requisicao, Task, User } from '../lib/types';
import { useNow } from '../hooks/useNow';
import {
  algumRodando, calcAtribuicaoSeconds, calcMeusSegundos, calcTotalSeconds,
  deadlineClass, deadlineLabel, formatSeconds, formatHM, minhaAtribuicao,
  severidadeColor, STATUS_LABELS, SEVERIDADE_LABELS,
} from '../lib/utils';
import styles from './Manager.module.css';

interface Props { user: User; onLogout: () => void; onPerfilAtualizado?: () => void; }
type Sheet = null | 'equipe' | 'monitor' | 'nova' | 'relatorio' | 'requisicoes' | 'especial' | 'corrigirDados';
type Aba = 'inicio' | 'tasks';
const ALL_STATUS = ['BACK_LOG','ATUANDO','EM_TESTES','LIBERADO_PARA_QA','DEPLOY','CONCLUIDO'] as const;
const MAX_RESPONSAVEIS = 3;
const MAX_ESPECIAIS = 3;

export function Manager({ user, onLogout, onPerfilAtualizado }: Props) {
  const now = useNow();
  const [aba, setAba] = useState<Aba>('inicio');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [equipe, setEquipe] = useState<User[]>([]);
  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([]);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [filtro, setFiltro] = useState<string>('Todas');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [monitorId, setMonitorId] = useState<string>('');
  const [erroGlobal, setErroGlobal] = useState('');

  // Correção de dados via requisição (G2) — gerente não edita direto mais.
  const [corrigirAlvo, setCorrigirAlvo] = useState<User | null>(null);
  const [corNome, setCorNome] = useState('');
  const [corEmail, setCorEmail] = useState('');
  const [corCargo, setCorCargo] = useState('');
  const [corJustificativa, setCorJustificativa] = useState('');
  const [corErro, setCorErro] = useState('');

  // Minha atividade — task self-assigned real, não estado local
  const [meuTitulo, setMeuTitulo] = useState('');
  const [criandoMinha, setCriandoMinha] = useState(false);

  // Nova task form
  const [fTitulo, setFTitulo] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fEmpresa, setFEmpresa] = useState('');
  const [fProjeto, setFProjeto] = useState('');
  const [fHoras, setFHoras] = useState('4');
  const [fData, setFData] = useState('');
  const [fSev, setFSev] = useState<Task['severidade']>('MEDIA');
  const [fUserIds, setFUserIds] = useState<string[]>([]);
  const [fStatus, setFStatus] = useState<Task['status']>('BACK_LOG');
  // G16: trabalho nasce faturável por padrão — a exceção é o interno.
  const [fFaturavel, setFFaturavel] = useState(true);
  const [criando, setCriando] = useState(false);
  const [erroForm, setErroForm] = useState('');

  // Task especial
  const [especialTitulo, setEspecialTitulo] = useState('');


  const load = useCallback(async () => {
    const [t, e, r] = await Promise.all([
      // As fixas vêm fora da paginação (G4): são no máximo 3 e ficam no rodapé.
      api.get<PaginaDeTasks>('/tasks?limite=200'),
      api.get<User[]>(`/users/team/${user.id}`),
      api.get<Requisicao[]>('/requisicoes'),
    ]);
    setTasks([...t.itens, ...t.especiais]);
    setEquipe(e);
    setRequisicoes(r);
  }, [user.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribeTaskEvents(load), [load]);

  const comuns = tasks.filter(t => t.tipo === 'COMUM');
  const especiais = tasks.filter(t => t.tipo === 'ESPECIAL').sort((a, b) => (a.ordemFixa ?? 0) - (b.ordemFixa ?? 0));
  const minhasEspeciais = especiais.filter(t => t.gerenteId === user.id);

  const reqPendentes = requisicoes.filter(r => r.status === 'PENDENTE' && r.destinatarioId === user.id);

  // "Minha atividade": task comum onde EU sou responsável e meu cronômetro roda.
  const minhaAtiva = comuns.find(t => minhaAtribuicao(t, user.id)?.rodando);
  const meuTotal = minhaAtiva ? calcMeusSegundos(minhaAtiva, user.id, now) : 0;

  const handleMinhaTask = async () => {
    if (!meuTitulo.trim()) return;
    setCriandoMinha(true);
    try {
      const dataFinal = new Date(); dataFinal.setDate(dataFinal.getDate() + 7);
      const t = await api.post<Task>('/tasks', {
        titulo: meuTitulo, userIds: [user.id], status: 'ATUANDO',
        severidade: 'BAIXA', horas: 1, dataFinal: dataFinal.toISOString().split('T')[0],
      });
      setMeuTitulo('');
      await api.post(`/tasks/${t.id}/start`);
      await load();
    } finally { setCriandoMinha(false); }
  };

  const handlePausarMinha = async () => {
    if (!minhaAtiva) return;
    await api.post(`/tasks/${minhaAtiva.id}/stop`);
    await load();
  };

  const toggleTask = (id: string) => setAbertos(a => ({ ...a, [id]: !a[id] }));

  const handleStart = async (id: string) => {
    await api.post(`/tasks/${id}/start`);
    await load();
  };

  /** Sem userId = paro o meu próprio cronômetro; com userId = paro o de um membro. */
  const handleStop = async (id: string, userId?: string) => {
    await api.post(`/tasks/${id}/stop`, userId ? { userId } : undefined);
    await load();
  };

  const handleStatusChange = async (id: string, status: Task['status']) => {
    await api.put(`/tasks/${id}`, { status });
    await load();
  };

  const handleDelete = async (id: string) => {
    setErroGlobal('');
    try {
      await api.delete(`/tasks/${id}`);
      await load();
    } catch (e: any) {
      setErroGlobal(e instanceof ApiError ? e.message : 'Não foi possível excluir a task.');
    }
  };

  const handleUpload = async (taskId: string, file: File) => {
    await uploadFile(`/anexos/tasks/${taskId}/anexos`, file);
    await load();
  };

  const handleDownload = async (anexoId: string, nome: string) => {
    await downloadFile(`/anexos/${anexoId}/download`, nome);
  };

  const handleRemoveAnexo = async (anexoId: string) => {
    await api.delete(`/anexos/${anexoId}`);
    await load();
  };

  const toggleResponsavel = (id: string) => {
    setErroForm('');
    setFUserIds(atual => {
      if (atual.includes(id)) return atual.filter(x => x !== id);
      if (atual.length >= MAX_RESPONSAVEIS) {
        setErroForm(`Uma task pode ter no máximo ${MAX_RESPONSAVEIS} responsáveis.`);
        return atual;
      }
      return [...atual, id];
    });
  };

  const handleCriarTask = async () => {
    if (!fTitulo.trim()) return;
    setCriando(true);
    setErroForm('');
    try {
      await api.post('/tasks', {
        titulo: fTitulo, descricao: fDesc, empresa: fEmpresa, projeto: fProjeto,
        horas: parseFloat(fHoras) || 1, dataFinal: fData,
        severidade: fSev, status: fStatus, faturavel: fFaturavel,
        // Sem ninguém selecionado, a task fica para o próprio gerente.
        userIds: fUserIds.length > 0 ? fUserIds : [user.id],
      });
      setSheet(null);
      setFTitulo(''); setFDesc(''); setFEmpresa(''); setFProjeto('');
      setFHoras('4'); setFData(''); setFSev('MEDIA'); setFUserIds([]); setFStatus('BACK_LOG'); setFFaturavel(true);
      await load();
    } catch (e: any) {
      setErroForm(e instanceof ApiError ? e.message : 'Não foi possível criar a task.');
    } finally { setCriando(false); }
  };

  const handleCriarEspecial = async () => {
    if (!especialTitulo.trim()) return;
    setCriando(true);
    setErroForm('');
    try {
      await api.post('/tasks/especiais', { titulo: especialTitulo });
      setEspecialTitulo('');
      setSheet(null);
      await load();
    } catch (e: any) {
      setErroForm(e instanceof ApiError ? e.message : 'Não foi possível criar a task fixa.');
    } finally { setCriando(false); }
  };

  const handleRenomearEspecial = async (taskId: string, titulo: string) => {
    await api.put(`/tasks/${taskId}`, { titulo });
    await load();
  };

  /**
   * Correção de dados agora é requisição ao master (G2) — o gerente não edita
   * conta de ninguém diretamente, nem a própria.
   */
  const handlePedirCorrecao = async () => {
    if (!corrigirAlvo) return;
    const payload: Record<string, string> = {};
    if (corNome.trim() && corNome !== corrigirAlvo.nome) payload.nome = corNome.trim();
    if (corEmail.trim() && corEmail !== corrigirAlvo.email) payload.email = corEmail.trim();
    if (corCargo.trim() !== (corrigirAlvo.cargo ?? '')) payload.cargo = corCargo.trim();

    if (Object.keys(payload).length === 0) { setCorErro('Altere ao menos um campo.'); return; }

    setCriando(true);
    setCorErro('');
    try {
      await api.post('/requisicoes', {
        tipo: 'ALTERAR_DADOS',
        alvoId: corrigirAlvo.id,
        payload,
        justificativa: corJustificativa.trim(),
      });
      setSheet(null); setCorrigirAlvo(null); setCorJustificativa('');
      await load();
    } catch (e: any) {
      setCorErro(e instanceof ApiError ? e.message : 'Não foi possível abrir a requisição.');
    } finally { setCriando(false); }
  };

  const abrirCorrecao = (alvo: User) => {
    setCorrigirAlvo(alvo);
    setCorNome(alvo.nome);
    setCorEmail(alvo.email);
    setCorCargo(alvo.cargo ?? '');
    setCorJustificativa('');
    setCorErro('');
    setSheet('corrigirDados');
  };

  const ativas = comuns.filter(t => t.status !== 'BACK_LOG' && t.status !== 'CONCLUIDO');
  const filtradas = filtro === 'Todas' ? comuns : comuns.filter(t => t.status === filtro);
  const monitorUser = equipe.find(e => e.id === monitorId);
  const monitorTasks = comuns.filter(t => t.atribuicoes.some(a => a.userId === monitorId));
  const monitorAtiva = monitorTasks.find(t => t.atribuicoes.find(a => a.userId === monitorId)?.rodando);

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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className={`${styles.equipeBtn} ${styles.btnComBadge}`}
            onClick={() => setSheet('requisicoes')}
            title="Requisições"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M10 2.5v7.5l4.5 2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.7" />
            </svg>
            {reqPendentes.length > 0 && <span className={styles.badge}>{reqPendentes.length}</span>}
          </button>
          <button className={styles.equipeBtn} onClick={() => setSheet('relatorio')}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M6 2.5h6l3 3V16a1 1 0 01-1 1H6a1 1 0 01-1-1V3.5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
              <path d="M7.5 9.5h5M7.5 12h5M7.5 7h2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <span>Relatório</span>
          </button>
          <button className={styles.equipeBtn} onClick={() => setSheet('equipe')}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1.8"/>
              <circle cx="14" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M2 17c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M14 11c2.2 0 4 1.8 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            <span>Equipe</span>
          </button>
          <button className={styles.sairBtn} onClick={onLogout} title="Sair">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <polyline points="3 3 3 8 8 8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Conteúdo scrollável */}
      <div className={styles.scrollArea}>
        {erroGlobal && (
          <p style={{ fontSize: 11.5, color: 'var(--fx-error)', textAlign: 'center' }}>{erroGlobal}</p>
        )}

        {aba === 'inicio' && (
          <>
            {/* Minha atividade */}
            <div className={styles.activityCard}>
              <div className={styles.activityTop}>
                <span className={styles.activityLabel}>Minha atividade</span>
                <span className={styles.activityStatus}>{minhaAtiva ? 'Cronômetro ativo' : 'Cronômetro parado'}</span>
              </div>
              {minhaAtiva ? (
                <div className={styles.activityRow}>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--fx-text-2)' }}>{minhaAtiva.titulo}</span>
                  <button className={`${styles.playBtn} ${styles.playing}`} onClick={handlePausarMinha}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <rect x="3" y="3" width="3.5" height="10" rx="1" fill="var(--fx-accent)"/>
                      <rect x="9.5" y="3" width="3.5" height="10" rx="1" fill="var(--fx-accent)"/>
                    </svg>
                  </button>
                </div>
              ) : (
                <div className={styles.activityRow}>
                  <div className="fx-field" style={{ flex: 1 }}>
                    <input
                      placeholder="No que você está trabalhando?"
                      value={meuTitulo}
                      onChange={e => setMeuTitulo(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleMinhaTask()}
                    />
                  </div>
                  <button className={styles.playBtn} onClick={handleMinhaTask} disabled={criandoMinha}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M5 3l8 5-8 5V3z" fill="var(--fx-accent)"/>
                    </svg>
                  </button>
                </div>
              )}
              <div className={styles.timerRow}>
                <span className={`${styles.timer} fx-tabular`}>{formatSeconds(meuTotal)}</span>
                <span className={styles.timerSub}>hoje · {formatHM(meuTotal)}</span>
              </div>
            </div>

            {/* Tasks em andamento */}
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>Tasks em andamento</span>
              <span className={styles.sectionCount}>{ativas.length} de {comuns.length}</span>
            </div>
            {ativas.length === 0
              ? <p className={styles.vazio}>Nenhuma task ativa no momento.</p>
              : ativas.map(t => <TaskCard key={t.id} task={t} now={now} aberta={!!abertos[t.id]} onToggle={toggleTask}
                  onStart={handleStart} onStop={handleStop} onStatus={handleStatusChange} onDelete={handleDelete}
                  onUpload={handleUpload} onDownload={handleDownload} onRemoveAnexo={handleRemoveAnexo}
                  onRecarregar={load} currentUserId={user.id} />)
            }
          </>
        )}

        {aba === 'tasks' && (
          <>
            <div className={styles.sectionHeader} style={{ marginTop: 0, paddingTop: 16 }}>
              <span className={styles.sectionTitle}>Todas as tasks</span>
              <span className={styles.sectionCount}>{comuns.length} tasks</span>
            </div>
            {/* Filtros */}
            <div className={styles.filtros}>
              {['Todas', ...ALL_STATUS].map(f => (
                <button
                  key={f}
                  className={`fx-chip ${filtro === f ? 'active' : ''}`}
                  onClick={() => setFiltro(f)}
                >
                  {f === 'Todas' ? 'Todas' : STATUS_LABELS[f as Task['status']]}
                </button>
              ))}
            </div>
            {filtradas.length === 0
              ? <p className={styles.vazio}>Nenhuma task neste status.</p>
              : filtradas.map(t => <TaskCard key={t.id} task={t} now={now} aberta={!!abertos[t.id]} onToggle={toggleTask}
                  onStart={handleStart} onStop={handleStop} onStatus={handleStatusChange} onDelete={handleDelete}
                  onUpload={handleUpload} onDownload={handleDownload} onRemoveAnexo={handleRemoveAnexo}
                  onRecarregar={load} currentUserId={user.id} />)
            }
          </>
        )}

        <div style={{ height: especiais.length > 0 ? 130 : 90 }} />
      </div>

      {/* Tasks fixas da equipe (G4) */}
      <EspeciaisBar
        especiais={especiais}
        userId={user.id}
        now={now}
        onStart={handleStart}
        onStop={(id) => handleStop(id)}
        onRenomear={handleRenomearEspecial}
      />

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
        <button className="fx-fab" style={{ right: 26, bottom: 104 }} onClick={() => { setSheet('nova'); setErroForm(''); }}>+</button>
      )}

      {/* Sheet: Equipe */}
      {sheet === 'equipe' && (
        <BottomSheet onClose={() => setSheet(null)} title="Monitorar equipe">
          <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              className="fx-btn-pill"
              style={{ width: '100%', height: 44, fontSize: 13 }}
              onClick={() => { setSheet('especial'); setErroForm(''); }}
            >
              + Task fixa da equipe ({minhasEspeciais.length}/{MAX_ESPECIAIS})
            </button>

            {equipe.map(e => {
              const taskAtiva = comuns.find(t => t.atribuicoes.find(a => a.userId === e.id)?.rodando);
              const totalDia = comuns.reduce((s, t) => {
                const a = t.atribuicoes.find(x => x.userId === e.id);
                return s + (a ? calcAtribuicaoSeconds(a, now) : 0);
              }, 0);
              return (
                <div key={e.id} className={styles.equipeRow} onClick={() => { setMonitorId(e.id); setSheet('monitor'); }}>
                  <Avatar nome={e.nome} size={40} />
                  <div style={{ flex: 1 }}>
                    <div className={styles.membroNome}>{e.nome}</div>
                    <div style={{ fontSize: 11, color: taskAtiva ? 'var(--fx-green)' : 'var(--fx-text-4)' }}>
                      {taskAtiva ? `Atuando · ${taskAtiva.titulo}` : 'Sem task ativa'}
                    </div>
                  </div>
                  <span className={`${styles.membroHoras} fx-tabular`} style={{ marginRight: 8 }}>{formatHM(totalDia)}</span>
                  <button
                    className="fx-btn-sq"
                    onClick={(event) => { event.stopPropagation(); abrirCorrecao(e); }}
                    title="Pedir correção de dados"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
                    </svg>
                  </button>
                </div>
              );
            })}
            {equipe.length === 0 && <p className={styles.vazio}>Nenhum usuário na equipe.</p>}

            <button
              className="fx-btn-pill"
              style={{ width: '100%', height: 40, fontSize: 12.5, marginTop: 6 }}
              onClick={() => abrirCorrecao(user)}
            >
              Pedir correção dos meus dados
            </button>
          </div>
        </BottomSheet>
      )}

      {/* Sheet: Monitor individual */}
      {sheet === 'monitor' && monitorUser && (
        <div className="fx-overlay" onClick={() => setSheet('equipe')}>
          <div style={{ width: '100%', height: '100%', background: 'rgba(231,234,239,0.86)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', padding: 26, overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
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
                <div className={`${styles.monitorTimer} fx-tabular`}>
                  {formatSeconds(calcAtribuicaoSeconds(monitorAtiva.atribuicoes.find(a => a.userId === monitorId)!, now))}
                </div>
                <button
                  className="fx-btn-pill"
                  style={{ width: '100%', marginTop: 12, height: 40, fontSize: 12.5 }}
                  onClick={() => handleStop(monitorAtiva.id, monitorId)}
                >
                  Pausar cronômetro
                </button>
              </div>
            ) : (
              <div className={styles.monitorCard} style={{ textAlign: 'center' }}>
                <p style={{ color: 'var(--fx-text-4)', fontSize: 13 }}>Sem task em execução</p>
              </div>
            )}
            <div style={{ marginTop: 20 }}>
              <span className={styles.equipeLabel}>Tasks vinculadas</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                {monitorTasks.map(t => {
                  const a = t.atribuicoes.find(x => x.userId === monitorId)!;
                  return (
                    <div key={t.id} className={styles.monitorTask}>
                      <div className={`fx-dot ${deadlineClass(t.dataFinal, t.status)}`} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fx-text-1)' }}>{t.titulo}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--fx-text-3)' }}>{STATUS_LABELS[t.status]} · {deadlineLabel(t.dataFinal)}</div>
                      </div>
                      <span className={`fx-tabular`} style={{ fontSize: 12, color: a.rodando ? 'var(--fx-accent)' : 'var(--fx-text-2)' }}>
                        {formatSeconds(calcAtribuicaoSeconds(a, now))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sheet: Requisições */}
      {sheet === 'requisicoes' && (
        <RequisicoesSheet
          requisicoes={requisicoes}
          souMaster={false}
          meuId={user.id}
          onClose={() => setSheet(null)}
          onResolvida={load}
        />
      )}

      {/* Sheet: Task fixa da equipe (G4) */}
      {sheet === 'especial' && (
        <BottomSheet onClose={() => setSheet(null)} title="Task fixa da equipe">
          <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 12, color: 'var(--fx-text-2)', lineHeight: 1.6 }}>
              Fica fixa no rodapé do seu painel e no de toda a equipe, com play e pause próprios.
              Roda em paralelo com uma task comum — mas só uma fixa por vez.
            </p>
            <div>
              <span className={styles.fieldLabel}>Nome</span>
              <div className="fx-field" style={{ marginTop: 6 }}>
                <input
                  placeholder="Daily, Reunião, Eventos…"
                  value={especialTitulo}
                  onChange={e => setEspecialTitulo(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCriarEspecial()}
                />
              </div>
            </div>
            {minhasEspeciais.length > 0 && (
              <div>
                <span className={styles.fieldLabel}>Já criadas</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {minhasEspeciais.map(t => <span key={t.id} className="fx-chip">{t.titulo}</span>)}
                </div>
              </div>
            )}
            {erroForm && <p style={{ fontSize: 11.5, color: 'var(--fx-error)', textAlign: 'center' }}>{erroForm}</p>}
            <button
              className="fx-btn-pill"
              style={{ width: '100%', height: 50, fontSize: 14 }}
              onClick={handleCriarEspecial}
              disabled={criando || !especialTitulo.trim() || minhasEspeciais.length >= MAX_ESPECIAIS}
            >
              {criando ? <div className="fx-spinner" /> : 'Criar task fixa'}
            </button>
          </div>
        </BottomSheet>
      )}

      {/* Sheet: Correção de dados via requisição (G2) */}
      {sheet === 'corrigirDados' && corrigirAlvo && (
        <BottomSheet onClose={() => { setSheet(null); setCorrigirAlvo(null); }} title="Pedir correção de dados">
          <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 12, color: 'var(--fx-text-2)', lineHeight: 1.6 }}>
              Alterações de cadastro passam pelo administrador. Sua solicitação para{' '}
              <strong>{corrigirAlvo.id === user.id ? 'os seus dados' : corrigirAlvo.nome}</strong> entra na fila dele.
            </p>
            <div className="fx-field">
              <input placeholder="Nome completo" value={corNome} onChange={e => setCorNome(e.target.value)} />
            </div>
            <div className="fx-field">
              <input type="email" placeholder="E-mail" value={corEmail} onChange={e => setCorEmail(e.target.value)} />
            </div>
            <div className="fx-field">
              <input placeholder="Cargo" value={corCargo} onChange={e => setCorCargo(e.target.value)} />
            </div>
            <div className="fx-field" style={{ height: 'auto', padding: '10px 18px' }}>
              <textarea
                placeholder="Motivo da correção (opcional)"
                value={corJustificativa}
                onChange={e => setCorJustificativa(e.target.value)}
                rows={2}
              />
            </div>
            {corErro && <p style={{ fontSize: 11.5, color: 'var(--fx-error)', textAlign: 'center' }}>{corErro}</p>}
            <button
              className="fx-btn-pill"
              style={{ width: '100%', height: 50, fontSize: 14 }}
              onClick={handlePedirCorrecao}
              disabled={criando}
            >
              {criando ? <div className="fx-spinner" /> : 'Enviar solicitação'}
            </button>
          </div>
        </BottomSheet>
      )}

      {/* Sheet: Nova task */}
      {sheet === 'nova' && (
        <BottomSheet onClose={() => setSheet(null)} title="Nova task">
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
                {(['BAIXA','MEDIA','ALTA','CRITICA'] as const).map(s => (
                  <button key={s} className={`fx-chip ${fSev === s ? 'active' : ''}`} onClick={() => setFSev(s)}>
                    <span className={`fx-dot ${severidadeColor(s)}`} />{SEVERIDADE_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className={styles.fieldLabel}>
                Responsáveis — até {MAX_RESPONSAVEIS} ({fUserIds.length} selecionado{fUserIds.length === 1 ? '' : 's'})
              </span>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {[user, ...equipe].map(e => (
                  <div
                    key={e.id}
                    style={{ textAlign: 'center', cursor: 'pointer' }}
                    onClick={() => toggleResponsavel(e.id)}
                  >
                    <Avatar nome={e.nome} size={46} inset={fUserIds.includes(e.id)} />
                    <div style={{
                      fontSize: 9,
                      marginTop: 3,
                      fontWeight: 600,
                      color: fUserIds.includes(e.id) ? 'var(--fx-accent)' : 'var(--fx-text-4)',
                    }}>
                      {e.id === user.id ? 'Eu' : e.nome.split(' ')[0]}
                    </div>
                  </div>
                ))}
              </div>
              {fUserIds.length === 0 && (
                <p style={{ fontSize: 10.5, color: 'var(--fx-text-4)', marginTop: 6 }}>
                  Sem seleção, a task fica para você.
                </p>
              )}
            </div>
            <div>
              <span className={styles.fieldLabel}>Status inicial</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {ALL_STATUS.map(s => (
                  <button key={s} className={`fx-chip ${fStatus === s ? 'active' : ''}`} onClick={() => setFStatus(s)}>{STATUS_LABELS[s]}</button>
                ))}
              </div>
            </div>
            <div>
              <span className={styles.fieldLabel}>Faturamento</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                <button className={`fx-chip ${fFaturavel ? 'active' : ''}`} onClick={() => setFFaturavel(true)}>Faturável ao cliente</button>
                <button className={`fx-chip ${!fFaturavel ? 'active' : ''}`} onClick={() => setFFaturavel(false)}>Interno</button>
              </div>
            </div>
            {erroForm && <p style={{ fontSize: 11.5, color: 'var(--fx-error)', textAlign: 'center' }}>{erroForm}</p>}
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

      {/* Sheet: Relatório */}
      {sheet === 'relatorio' && (
        <RelatorioSheet
          timezone={user.timezone ?? 'America/Sao_Paulo'}
          equipe={equipe}
          onClose={() => setSheet(null)}
          onPerfilAtualizado={onPerfilAtualizado}
        />
      )}
    </>
  );
}

// ─── TaskCard inline component ──────────────────────────────────────────────
interface TaskCardProps {
  task: Task; now: number; aberta: boolean;
  onToggle: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string, userId?: string) => void;
  onStatus: (id: string, s: Task['status']) => void;
  onDelete: (id: string) => void;
  onUpload: (taskId: string, file: File) => void;
  onDownload: (anexoId: string, nome: string) => void;
  onRemoveAnexo: (anexoId: string) => void;
  onRecarregar: () => void;
  currentUserId: string;
}

function TaskCard({
  task, now, aberta, onToggle, onStart, onStop, onStatus, onDelete,
  onUpload, onDownload, onRemoveAnexo, onRecarregar, currentUserId,
}: TaskCardProps) {
  // O gerente enxerga o total investido por todos; o botão de play só age no dele.
  const total = calcTotalSeconds(task, now);
  const minha = minhaAtribuicao(task, currentUserId);
  const dlClass = deadlineClass(task.dataFinal, task.status);
  const progress = Math.min(100, (total / (task.horas * 3600)) * 100);
  const restam = Math.max(0, task.horas * 3600 - total);

  const statusColors: Record<string, string> = { 'green': 'var(--fx-green)', 'yellow': 'var(--fx-yellow)', 'orange': 'var(--fx-orange)', 'red': 'var(--fx-red)' };

  return (
    <div className={styles.taskCard} onClick={() => onToggle(task.id)}>
      <div className={`fx-dot ${dlClass}`} style={{ position: 'absolute', top: 14, left: 14, boxShadow: `0 0 0 3px rgba(255,255,255,0.6)` }} />
      <div style={{ paddingLeft: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fx-text-1)', lineHeight: 1.3 }}>{task.titulo}</div>
            {task.empresa && <div style={{ fontSize: 10, color: 'var(--fx-text-3)', marginTop: 2 }}>{task.empresa} · {task.projeto}</div>}
          </div>
          <span className="fx-chip">{STATUS_LABELS[task.status]}</span>
        </div>

        {/* Um responsável: linha compacta. Vários: uma linha por pessoa, com o
            cronômetro individual — é o que a delegação múltipla (G3) precisa mostrar. */}
        {task.atribuicoes.map(a => (
          <div key={a.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0' }}>
            <Avatar nome={a.nome} size={26} inset />
            <span style={{ fontSize: 12.5, color: 'var(--fx-text-2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {a.userId === currentUserId ? 'Eu' : a.nome}
            </span>
            <span className="fx-tabular" style={{ fontSize: 12.5, fontWeight: 700, color: a.rodando ? 'var(--fx-accent)' : 'var(--fx-text-2)' }}>
              {formatSeconds(calcAtribuicaoSeconds(a, now))}
            </span>
            {aberta && a.rodando && a.userId !== currentUserId && (
              <button
                className="fx-btn-sq"
                title={`Pausar cronômetro de ${a.nome.split(' ')[0]}`}
                onClick={(e) => { e.stopPropagation(); onStop(task.id, a.userId); }}
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                  <rect x="3" y="3" width="3.5" height="10" rx="1" fill="var(--fx-accent)" />
                  <rect x="9.5" y="3" width="3.5" height="10" rx="1" fill="var(--fx-accent)" />
                </svg>
              </button>
            )}
          </div>
        ))}

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
              <span className="fx-chip">{task.codigo}</span>
              <span className={`fx-chip`} style={{ color: statusColors[severidadeColor(task.severidade)] }}><span className={`fx-dot ${severidadeColor(task.severidade)}`} />{SEVERIDADE_LABELS[task.severidade]}</span>
              <span className="fx-chip">{task.horas}h estimadas</span>
            </div>

            {/* Anexos */}
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.6, textTransform: 'uppercase', color: 'var(--fx-text-3)', display: 'block', marginBottom: 8 }}>
                Anexos
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {task.anexos.map(a => (
                  <span key={a.id} className="fx-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ cursor: 'pointer' }} onClick={() => onDownload(a.id, a.nome)}>📎 {a.nome}</span>
                    <span style={{ cursor: 'pointer', color: 'var(--fx-text-4)' }} onClick={() => onRemoveAnexo(a.id)}>✕</span>
                  </span>
                ))}
              </div>
              <label className="fx-btn-pill" style={{ display: 'block', textAlign: 'center', cursor: 'pointer' }}>
                + Anexar arquivo
                <input
                  type="file"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) onUpload(task.id, file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {ALL_STATUS.map(s => (
                <button key={s} className={`fx-chip ${task.status === s ? 'active' : ''}`} onClick={() => onStatus(task.id, s)}>{STATUS_LABELS[s]}</button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {minha ? (
                minha.rodando ? (
                  <button className="fx-btn-pill" style={{ flex: 1 }} onClick={() => onStop(task.id)}>⏸ Pausar</button>
                ) : (
                  <button className="fx-btn-pill" style={{ flex: 1 }} onClick={() => onStart(task.id)}>▶ Iniciar</button>
                )
              ) : (
                <span style={{ flex: 1, fontSize: 12, color: 'var(--fx-text-4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {algumRodando(task) ? 'Em execução pela equipe' : 'Aguardando início pelo responsável'}
                </span>
              )}
              <button className="fx-btn-sq danger" style={{ width: 44, height: 44, borderRadius: 12 }} onClick={() => onDelete(task.id)}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M3 5h10M6 5V3h4v2M6 7v5M10 7v5M4 5l1 8h6l1-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            <TimeLogHistory taskId={task.id} currentUserId={currentUserId} souGerente onAlterado={onRecarregar} />
          </div>
        )}
      </div>
    </div>
  );
}
