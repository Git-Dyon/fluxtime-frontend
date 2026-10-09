import { useCallback, useEffect, useState } from 'react';
import { TitleBar } from '../components/TitleBar';
import { Avatar } from '../components/Avatar';
import { BottomSheet } from '../components/BottomSheet';
import { RequisicoesSheet } from '../components/RequisicoesSheet';
import { AuditoriaSheet } from '../components/AuditoriaSheet';
import { api, ApiError, clearToken } from '../lib/api';
import type { Pagina, Requisicao, User, UsuarioCongelado } from '../lib/types';
import { FUSOS_COMUNS } from '../lib/utils';
import styles from './ManagerMaster.module.css';

interface Props {
  user: User;
  onLogout: () => void;
}

type Bloqueios = {
  equipe: { id: string; nome: string }[];
  tasksProprias: { id: string; codigo: string; titulo: string }[];
};

type Sheet = null | 'novo' | 'vincular' | 'reatribuir' | 'editar' | 'requisicoes' | 'freezer' | 'novaRequisicao' | 'auditoria';

/** Ações sobre usuário tutelado que a API só aceita via requisição (G2). */
type PedidoPendente = {
  alvo: User;
  tipo: 'REMOVER_DA_EQUIPE' | 'MOVER_DE_EQUIPE';
  gerenteDestinoId?: string;
};

export function ManagerMaster({ user, onLogout }: Props) {
  const [aba, setAba] = useState<'gerentes' | 'usuarios'>('gerentes');
  const [busca, setBusca] = useState('');
  const [gerentes, setGerentes] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<User[]>([]);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState<Sheet>(null);
  const [alvoGerente, setAlvoGerente] = useState<string>('');
  const [novoTipo, setNovoTipo] = useState<'MANAGER' | 'USER'>('USER');
  const [novoNome, setNovoNome] = useState('');
  const [novoEmail, setNovoEmail] = useState('');
  const [novoGerenteId, setNovoGerenteId] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [alvoExclusao, setAlvoExclusao] = useState<string>('');
  const [acaoPendente, setAcaoPendente] = useState<'excluir' | 'rebaixar'>('excluir');
  const [bloqueios, setBloqueios] = useState<Bloqueios>({ equipe: [], tasksProprias: [] });
  // Senha provisória recém-gerada. Fica na tela até o master fechar — não é recuperável depois.
  const [credencial, setCredencial] = useState<{ nome: string; senha: string } | null>(null);

  const [editUser, setEditUser] = useState<User | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCargo, setEditCargo] = useState('');
  const [editFuso, setEditFuso] = useState('America/Sao_Paulo');
  const [editErro, setEditErro] = useState('');
  const [editResetSucesso, setEditResetSucesso] = useState('');

  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([]);
  const [congelados, setCongelados] = useState<UsuarioCongelado[]>([]);
  const [pedido, setPedido] = useState<PedidoPendente | null>(null);
  const [pedidoJustificativa, setPedidoJustificativa] = useState('');
  const [pedidoErro, setPedidoErro] = useState('');
  /** Gerentes + usuários — alimenta o filtro "quem fez" da trilha de auditoria. */
  const [todosUsuarios, setTodosUsuarios] = useState<User[]>([]);

  const load = useCallback(async () => {
    const [g, u, r, c] = await Promise.all([
      api.get<any[]>('/users/managers'),
      api.get<Pagina<User>>('/users?limite=200'),
      api.get<Requisicao[]>('/requisicoes'),
      api.get<UsuarioCongelado[]>('/users/congelados'),
    ]);
    setRequisicoes(r);
    setCongelados(c);
    // Load teams for each manager
    const gerentesComEquipe = await Promise.all(
      g.map(async (ger: any) => {
        const team = await api.get<User[]>(`/users/team/${ger.id}`);
        return { ...ger, equipe: team };
      })
    );
    setGerentes(gerentesComEquipe);
    setTodosUsuarios(u.itens);
    setUsuarios(u.itens.filter((x) => x.perfil === 'USER'));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => setAbertos(a => ({ ...a, [id]: !a[id] }));

  const filtrarGerentes = gerentes.filter(g =>
    g.nome.toLowerCase().includes(busca.toLowerCase()) ||
    g.email.toLowerCase().includes(busca.toLowerCase())
  );

  const filtrarUsuarios = usuarios.filter(u =>
    u.nome.toLowerCase().includes(busca.toLowerCase()) ||
    u.email.toLowerCase().includes(busca.toLowerCase())
  );

  const handleCadastrar = async () => {
    if (!novoNome.trim() || !novoEmail.trim()) { setErro('Nome e e-mail são obrigatórios.'); return; }
    setSalvando(true); setErro('');
    try {
      const criado = await api.post<{ nome: string; senhaProvisoria: string }>('/users', {
        nome: novoNome, email: novoEmail, perfil: novoTipo, gerenteId: novoGerenteId || null,
      });
      // A senha só existe nesta resposta: o banco guarda o hash e a auditoria a omite.
      setCredencial({ nome: criado.nome, senha: criado.senhaProvisoria });
      setSheet(null); setNovoNome(''); setNovoEmail(''); setNovoGerenteId('');
      await load();
    } catch (e: any) { setErro(e.message); }
    setSalvando(false);
  };

  /** true se a API recusou a ação exigindo o fluxo de requisição de 3 dias (G2). */
  const exigeRequisicao = (e: unknown): boolean =>
    e instanceof ApiError && e.data?.detalhes?.codigo === 'REQUISICAO_NECESSARIA';

  const abrirPedido = (alvo: User, tipo: PedidoPendente['tipo'], gerenteDestinoId?: string) => {
    setPedido({ alvo, tipo, gerenteDestinoId });
    setPedidoJustificativa('');
    setPedidoErro('');
    setSheet('novaRequisicao');
  };

  const handleVincular = async (userId: string) => {
    const alvo = usuarios.find(u => u.id === userId);
    try {
      await api.put(`/users/${userId}/assign`, { gerenteId: alvoGerente });
      setSheet(null); await load();
    } catch (e) {
      // Já está sob outro gerente: mover exige requisição com prazo.
      if (exigeRequisicao(e) && alvo) abrirPedido(alvo, 'MOVER_DE_EQUIPE', alvoGerente);
      else throw e;
    }
  };

  const handleDesvincular = async (userId: string) => {
    const alvo = usuarios.find(u => u.id === userId);
    try {
      await api.put(`/users/${userId}/unassign`);
      await load();
    } catch (e) {
      if (exigeRequisicao(e) && alvo) abrirPedido(alvo, 'REMOVER_DA_EQUIPE');
      else throw e;
    }
  };

  const handlePromover = async (userId: string) => {
    await api.put(`/users/${userId}/promote`, {});
    await load();
  };

  const abrirBloqueio = (id: string, acao: 'excluir' | 'rebaixar', err: ApiError) => {
    setAlvoExclusao(id);
    setAcaoPendente(acao);
    setBloqueios(err.data?.detalhes?.bloqueios || { equipe: [], tasksProprias: [] });
    setSheet('reatribuir');
  };

  /** "Excluir" manda para o freezer de 7 dias, não apaga (G1). */
  const handleExcluir = async (id: string) => {
    const alvo = usuarios.find(u => u.id === id) ?? gerentes.find(g => g.id === id);
    try {
      await api.delete(`/users/${id}`);
      if (id === alvoExclusao) setSheet(null);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) abrirBloqueio(id, 'excluir', e);
      else if (exigeRequisicao(e) && alvo) abrirPedido(alvo as User, 'REMOVER_DA_EQUIPE');
      else throw e;
    }
  };

  const handleResgatar = async (id: string) => {
    await api.post(`/users/${id}/resgatar`);
    await load();
  };

  const handleRebaixar = async (id: string) => {
    try {
      await api.put(`/users/${id}/demote`, {});
      if (id === alvoExclusao) setSheet(null);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) abrirBloqueio(id, 'rebaixar', e);
      else throw e;
    }
  };

  const handleEnviarPedido = async () => {
    if (!pedido) return;
    setSalvando(true);
    setPedidoErro('');
    try {
      await api.post('/requisicoes', {
        tipo: pedido.tipo,
        alvoId: pedido.alvo.id,
        gerenteDestinoId: pedido.gerenteDestinoId,
        justificativa: pedidoJustificativa.trim(),
      });
      setSheet(null); setPedido(null);
      await load();
    } catch (e: any) {
      setPedidoErro(e instanceof ApiError ? e.message : 'Não foi possível abrir a requisição.');
    } finally { setSalvando(false); }
  };

  const refreshBloqueios = useCallback(async () => {
    if (!alvoExclusao) return;
    const b = await api.get<Bloqueios>(`/users/${alvoExclusao}/deletion-blockers`);
    setBloqueios(b);
  }, [alvoExclusao]);

  const handleReatribuirMembro = async (userId: string, gerenteId: string) => {
    const alvo = usuarios.find(u => u.id === userId);
    try {
      await api.put(`/users/${userId}/assign`, { gerenteId });
      await refreshBloqueios();
      await load();
    } catch (e) {
      if (exigeRequisicao(e) && alvo) abrirPedido(alvo, 'MOVER_DE_EQUIPE', gerenteId);
      else throw e;
    }
  };

  /** deUserId é o gerente sendo esvaziado; userId é quem recebe o vínculo. */
  const handleReatribuirTask = async (taskId: string, userId: string) => {
    await api.put(`/tasks/${taskId}/reassign`, { deUserId: alvoExclusao, userId });
    await refreshBloqueios();
  };

  const handleConcluirAcaoPendente = () =>
    acaoPendente === 'excluir' ? handleExcluir(alvoExclusao) : handleRebaixar(alvoExclusao);

  const handleEditar = async () => {
    if (!editUser) return;
    if (!editNome.trim() || !editEmail.trim()) { setEditErro('Nome e e-mail são obrigatórios.'); return; }
    setSalvando(true); setEditErro(''); setEditResetSucesso('');
    try {
      await api.put(`/users/${editUser.id}`, { nome: editNome, email: editEmail, cargo: editCargo, timezone: editFuso });
      setSheet(null); setEditUser(null);
      await load();
    } catch (e: any) { setEditErro(e.message); }
    setSalvando(false);
  };

  const handleResetSenha = async () => {
    if (!editUser) return;
    setEditErro(''); setEditResetSucesso('');
    try {
      const r = await api.post<{ senhaProvisoria: string }>(`/users/${editUser.id}/reset-password`, {});
      setCredencial({ nome: editUser.nome, senha: r.senhaProvisoria });
      setEditResetSucesso('Senha redefinida. Anote a nova senha provisória exibida.');
    } catch (e: any) { setEditErro(e.message); }
  };

  const handleLogout = () => { clearToken(); onLogout(); };

  const usuariosSemGerente = usuarios.filter(u => !u.gerenteId);
  const reqPendentes = requisicoes.filter(r => r.status === 'PENDENTE');

  return (
    <>
      <TitleBar />

      {/* Cabeçalho */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Avatar nome={user.nome} size={44} />
          <div>
            <span className={styles.perfil}>Manager Master</span>
            <div className={styles.nome}>{user.nome}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className={styles.sairBtn}
            style={{ position: 'relative' }}
            onClick={() => setSheet('requisicoes')}
            title="Requisições"
          >
            <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
              <path d="M10 2.5v7.5l4.5 2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.7" />
            </svg>
            {reqPendentes.length > 0 && (
              <span style={{
                position: 'absolute', top: -2, right: -2, minWidth: 17, height: 17, padding: '0 4px',
                borderRadius: 9, background: 'var(--fx-error)', color: '#fff', fontSize: 10,
                fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{reqPendentes.length}</span>
            )}
          </button>
          <button
            className={styles.sairBtn}
            style={{ position: 'relative' }}
            onClick={() => setSheet('freezer')}
            title="Freezer"
          >
            <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M10 2.5v15M3.5 6.25l13 7.5M16.5 6.25l-13 7.5" />
            </svg>
            {congelados.length > 0 && (
              <span style={{
                position: 'absolute', top: -2, right: -2, minWidth: 17, height: 17, padding: '0 4px',
                borderRadius: 9, background: 'var(--fx-accent)', color: '#fff', fontSize: 10,
                fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{congelados.length}</span>
            )}
          </button>
          {/* Trilha de auditoria (G8): exclusiva do master — é a única visão que
              enxerga o que os gerentes fizeram, não só os usuários. */}
          <button className={styles.sairBtn} onClick={() => setSheet('auditoria')} title="Trilha de auditoria">
            <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5.5 2.5h6l3.5 3.5v11a.5.5 0 01-.5.5H5.5a.5.5 0 01-.5-.5v-14a.5.5 0 01.5-.5z" />
              <path d="M11 2.5V6h3.5M7.5 10h5M7.5 13h3.5" />
            </svg>
          </button>
          <button className={styles.sairBtn} onClick={handleLogout} title="Sair">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <polyline points="3 3 3 8 8 8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Título */}
      <div className={styles.titleArea}>
        <h1 className={styles.title}>Gestão de usuários</h1>
        <span className={styles.counter}>{gerentes.length} gerentes · {usuarios.length} usuários</span>
      </div>

      {/* Busca */}
      <div className={styles.searchWrap}>
        <div className={styles.searchField}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
            <circle cx="9" cy="9" r="6" stroke="var(--fx-text-4)" strokeWidth="1.8"/>
            <line x1="14" y1="14" x2="18" y2="18" stroke="var(--fx-text-4)" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <input
            placeholder="Buscar por nome ou e-mail"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className={styles.searchInput}
          />
        </div>
      </div>

      {/* Abas */}
      <div className={styles.tabsWrap}>
        <div className="fx-segtabs">
          <div className={`fx-segtab ${aba === 'gerentes' ? 'active' : ''}`} onClick={() => setAba('gerentes')}>Gerentes</div>
          <div className={`fx-segtab ${aba === 'usuarios' ? 'active' : ''}`} onClick={() => setAba('usuarios')}>Usuários</div>
        </div>
      </div>

      {/* Lista */}
      <div className={styles.list}>
        {aba === 'gerentes' && filtrarGerentes.map(g => (
          <div key={g.id} className={styles.gerenteCard}>
            {/* Cabeçalho do card do gerente */}
            <div className={styles.gerenteHeader} onClick={() => toggle(g.id)}>
              <Avatar nome={g.nome} size={40} />
              <div className={styles.gerenteInfo}>
                <span className={styles.gerenteNome}>{g.nome}</span>
                <span className={styles.gerenteEmail}>{g.cargo || 'Gerente'}</span>
              </div>
              <div className={`fx-chip ${abertos[g.id] ? 'active' : ''}`}>{g.totalUsuarios || g.equipe?.length || 0} usuários</div>
              <button className="fx-btn-sq" onClick={(e) => { e.stopPropagation(); setEditUser(g); setEditNome(g.nome); setEditEmail(g.email); setEditCargo(g.cargo || ''); setEditFuso(g.timezone || 'America/Sao_Paulo'); setEditErro(''); setEditResetSucesso(''); setSheet('editar'); }} title="Editar gerente">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
                </svg>
              </button>
              <button className="fx-btn-sq" onClick={(e) => { e.stopPropagation(); handleRebaixar(g.id); }} title="Rebaixar a usuário">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 2v8M2 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <button className="fx-btn-sq danger" onClick={(e) => { e.stopPropagation(); handleExcluir(g.id); }} title="Excluir gerente">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M3 5h10M6 5V3h4v2M6 7v5M10 7v5M4 5l1 8h6l1-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            {/* Equipe expandida */}
            {abertos[g.id] && (
              <div className={styles.equipe}>
                <hr className="fx-divider" style={{ margin: '0 0 12px' }} />
                <span className={styles.equipeLabel}>Equipe monitorada</span>
                {(!g.equipe || g.equipe.length === 0) ? (
                  <p className={styles.vazio}>Nenhum usuário vinculado a este gerente.</p>
                ) : (
                  g.equipe.map((u: User) => (
                    <div key={u.id} className={styles.membroRow}>
                      <Avatar nome={u.nome} size={32} inset />
                      <div className={styles.membroInfo}>
                        <span className={styles.membroNome}>{u.nome}</span>
                        <span className={styles.membroCargo}>{u.cargo}</span>
                      </div>
                      <button className="fx-btn-sq" title="Elevar a gerente" onClick={() => handlePromover(u.id)}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M6 10V2M2 6l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <button className="fx-btn-sq danger" title="Remover da equipe" onClick={() => handleDesvincular(u.id)}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                          <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  ))
                )}
                <button
                  className="fx-btn-pill"
                  style={{ width: '100%', marginTop: 12, fontSize: 12 }}
                  onClick={() => { setAlvoGerente(g.id); setSheet('vincular'); }}
                >
                  + Vincular usuário
                </button>
              </div>
            )}
          </div>
        ))}

        {aba === 'usuarios' && filtrarUsuarios.map(u => (
          <div key={u.id} className={styles.usuarioRow}>
            <Avatar nome={u.nome} size={36} />
            <div className={styles.usuarioInfo}>
              <span className={styles.usuarioNome}>{u.nome}</span>
              <span className={u.gerenteId ? styles.vinculado : styles.semGerente}>
                {u.gerenteId
                  ? `Gerente · ${gerentes.find(g => g.id === u.gerenteId)?.nome || '—'}`
                  : 'Sem gerente vinculado'
                }
              </span>
            </div>
            <button className="fx-btn-sq" onClick={(e) => { e.stopPropagation(); setEditUser(u); setEditNome(u.nome); setEditEmail(u.email); setEditCargo(u.cargo || ''); setEditFuso(u.timezone || 'America/Sao_Paulo'); setEditErro(''); setEditResetSucesso(''); setSheet('editar'); }} title="Editar usuário">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
              </svg>
            </button>
            <button className="fx-btn-sq" title="Promover a gerente" onClick={() => handlePromover(u.id)}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 10V2M2 6l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button className="fx-btn-sq danger" title="Excluir" onClick={() => handleExcluir(u.id)}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M3 5h10M6 5V3h4v2M6 7v5M10 7v5M4 5l1 8h6l1-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        ))}

        {/* Espaço para o FAB */}
        <div style={{ height: 80 }} />
      </div>

      {/* FAB */}
      <button className="fx-fab" style={{ right: 26, bottom: 26 }} onClick={() => { setSheet('novo'); setErro(''); }}>+</button>

      {/* Senha provisória: aparece uma única vez, logo após criar o usuário ou
          resetar a senha. Não há como recuperá-la depois — só gerar outra. */}
      {credencial && (
        <BottomSheet onClose={() => setCredencial(null)} title="Senha provisória">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 8 }}>
            <span className={styles.sheetLabel}>{credencial.nome}</span>
            <div
              style={{
                fontFamily: 'ui-monospace, Consolas, monospace',
                fontSize: 21,
                letterSpacing: '0.06em',
                textAlign: 'center',
                padding: '18px 12px',
                borderRadius: 'var(--radius-card)',
                boxShadow: 'var(--shadow-inset-field)',
                color: 'var(--fx-text-input)',
                userSelect: 'all',
                wordBreak: 'break-all',
              }}
            >
              {credencial.senha}
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--fx-text-2)', margin: 0 }}>
              Anote e entregue ao funcionário por um canal seguro. Ela não fica gravada em
              lugar nenhum e será exigida a troca no primeiro acesso.
            </p>
            <button
              className="fx-btn-pill"
              style={{ width: '100%', height: 48, fontSize: 14 }}
              onClick={() => { void navigator.clipboard?.writeText(credencial.senha); }}
            >
              Copiar senha
            </button>
            <button
              className="fx-btn-pill"
              style={{ width: '100%', height: 44, fontSize: 13 }}
              onClick={() => setCredencial(null)}
            >
              Já anotei, fechar
            </button>
          </div>
        </BottomSheet>
      )}

      {/* Bottom sheet: Requisições (G2) */}
      {sheet === 'requisicoes' && (
        <RequisicoesSheet
          requisicoes={requisicoes}
          souMaster
          meuId={user.id}
          onClose={() => setSheet(null)}
          onResolvida={load}
        />
      )}

      {sheet === 'auditoria' && (
        <AuditoriaSheet
          timezone={user.timezone ?? 'America/Sao_Paulo'}
          pessoas={todosUsuarios}
          onClose={() => setSheet(null)}
        />
      )}

      {/* Bottom sheet: Freezer de 7 dias (G1) */}
      {sheet === 'freezer' && (
        <BottomSheet onClose={() => setSheet(null)} title="Freezer">
          <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 12, color: 'var(--fx-text-2)', lineHeight: 1.6 }}>
              Excluir um usuário não apaga nada de imediato: ele fica aqui por 7 dias e pode ser
              resgatado. Depois disso, os dados pessoais são anonimizados — as horas trabalhadas
              permanecem no histórico.
            </p>
            {congelados.length === 0 ? (
              <p className={styles.vazio}>Ninguém no freezer.</p>
            ) : congelados.map(c => (
              <div key={c.id} className={styles.membroRow}>
                <Avatar nome={c.nome} size={36} inset />
                <div className={styles.membroInfo}>
                  <span className={styles.membroNome}>{c.nome}</span>
                  <span className={styles.membroCargo}>
                    {c.diasRestantes > 0
                      ? `Expurgo em ${c.diasRestantes} dia${c.diasRestantes === 1 ? '' : 's'}`
                      : 'Expurgo iminente'}
                    {c.congeladoPorNome ? ` · por ${c.congeladoPorNome}` : ''}
                  </span>
                </div>
                <button
                  className="fx-btn-pill"
                  style={{ height: 34, fontSize: 12, padding: '0 14px' }}
                  onClick={() => handleResgatar(c.id)}
                >
                  Resgatar
                </button>
              </div>
            ))}
          </div>
        </BottomSheet>
      )}

      {/* Bottom sheet: Abrir requisição sobre usuário tutelado (G2) */}
      {sheet === 'novaRequisicao' && pedido && (
        <BottomSheet onClose={() => { setSheet(null); setPedido(null); }} title="Abrir requisição">
          <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 12.5, color: 'var(--fx-text-1)', lineHeight: 1.6 }}>
              <strong>{pedido.alvo.nome}</strong> está sob a tutela de um gerente, então esta
              mudança não é imediata.
            </p>
            <p style={{ fontSize: 12, color: 'var(--fx-text-2)', lineHeight: 1.6 }}>
              {pedido.tipo === 'REMOVER_DA_EQUIPE'
                ? 'O gerente atual tem 3 dias para responder. Se não responder, a remoção é aplicada automaticamente.'
                : `A mudança para a equipe de ${gerentes.find(g => g.id === pedido.gerenteDestinoId)?.nome ?? '—'} será aplicada automaticamente se o gerente atual não responder em 3 dias.`}
            </p>
            <div className="fx-field" style={{ height: 'auto', padding: '10px 18px' }}>
              <textarea
                placeholder="Justificativa (opcional, mas ajuda o gerente a decidir)"
                value={pedidoJustificativa}
                onChange={e => setPedidoJustificativa(e.target.value)}
                rows={3}
              />
            </div>
            {pedidoErro && <p style={{ fontSize: 11.5, color: 'var(--fx-error)', textAlign: 'center' }}>{pedidoErro}</p>}
            <button
              className="fx-btn-pill"
              style={{ width: '100%', height: 50, fontSize: 14 }}
              onClick={handleEnviarPedido}
              disabled={salvando}
            >
              {salvando ? <div className="fx-spinner" /> : 'Abrir requisição'}
            </button>
          </div>
        </BottomSheet>
      )}

      {/* Bottom sheet: Novo cadastro */}
      {sheet === 'novo' && (
        <BottomSheet onClose={() => setSheet(null)} title="Novo cadastro">
          <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Segmented */}
            <div className="fx-segtabs">
              <div className={`fx-segtab ${novoTipo === 'MANAGER' ? 'active' : ''}`} onClick={() => setNovoTipo('MANAGER')}>Gerente</div>
              <div className={`fx-segtab ${novoTipo === 'USER' ? 'active' : ''}`} onClick={() => setNovoTipo('USER')}>Usuário</div>
            </div>

            <div className="fx-field">
              <input placeholder="Nome completo" value={novoNome} onChange={e => setNovoNome(e.target.value)} />
            </div>
            <div className="fx-field">
              <input type="email" placeholder="E-mail (ID de acesso)" value={novoEmail} onChange={e => setNovoEmail(e.target.value)} />
            </div>

            {novoTipo === 'USER' && gerentes.length > 0 && (
              <div>
                <span className={styles.sheetLabel}>Responsável</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {gerentes.map(g => (
                    <button
                      key={g.id}
                      className={`fx-chip ${novoGerenteId === g.id ? 'active' : ''}`}
                      onClick={() => setNovoGerenteId(novoGerenteId === g.id ? '' : g.id)}
                    >
                      {g.nome.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {erro && <p style={{ fontSize: 11.5, color: 'var(--fx-error)', textAlign: 'center' }}>{erro}</p>}

            <button
              className="fx-btn-pill"
              style={{ width: '100%', height: 50, fontSize: 14 }}
              onClick={handleCadastrar}
              disabled={salvando}
            >
              {salvando ? <div className="fx-spinner" /> : `Cadastrar ${novoTipo === 'MANAGER' ? 'gerente' : 'usuário'}`}
            </button>

            <p style={{ fontSize: 10.5, color: 'var(--fx-text-4)', textAlign: 'center' }}>
              Uma senha provisória será sorteada e exibida uma única vez após o cadastro.
            </p>
          </div>
        </BottomSheet>
      )}

      {/* Bottom sheet: Vincular usuário */}
      {sheet === 'vincular' && (
        <BottomSheet onClose={() => setSheet(null)} title={`Vincular usuário`}>
          <div style={{ paddingTop: 16 }}>
            <p style={{ fontSize: 12, color: 'var(--fx-text-2)', marginBottom: 16 }}>
              Selecione quem passará a aparecer na tela de{' '}
              <strong>{gerentes.find(g => g.id === alvoGerente)?.nome}</strong>.
            </p>
            {usuariosSemGerente.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--fx-text-4)', textAlign: 'center' }}>
                Todos os usuários já estão vinculados a um gerente.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {usuariosSemGerente.map(u => (
                  <div key={u.id} className={styles.membroRow} style={{ cursor: 'pointer' }} onClick={() => handleVincular(u.id)}>
                    <Avatar nome={u.nome} size={36} />
                    <div className={styles.membroInfo}>
                      <span className={styles.membroNome}>{u.nome}</span>
                      <span className={styles.membroCargo}>{u.cargo || 'Sem cargo'}</span>
                    </div>
                    <div className={`fx-chip`}>+</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </BottomSheet>
      )}

      {/* Bottom sheet: Reatribuir dependências antes de excluir/rebaixar */}
      {sheet === 'reatribuir' && (
        <BottomSheet onClose={() => setSheet(null)} title="Reatribuir dependências">
          <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 12, color: 'var(--fx-text-2)' }}>
              <strong>{gerentes.find(g => g.id === alvoExclusao)?.nome}</strong> ainda tem equipe e/ou tasks vinculadas.
              Reatribua tudo abaixo para poder continuar.
            </p>

            {bloqueios.equipe.length > 0 && (
              <div>
                <span className={styles.sheetLabel}>Equipe ({bloqueios.equipe.length})</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                  {bloqueios.equipe.map(u => (
                    <div key={u.id} className={styles.membroRow}>
                      <Avatar nome={u.nome} size={32} inset />
                      <div className={styles.membroInfo}>
                        <span className={styles.membroNome}>{u.nome}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {gerentes.filter(g => g.id !== alvoExclusao).map(g => (
                          <button key={g.id} className="fx-chip" onClick={() => handleReatribuirMembro(u.id, g.id)}>
                            {g.nome.split(' ')[0]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {bloqueios.tasksProprias.length > 0 && (
              <div>
                <span className={styles.sheetLabel}>Tasks próprias ({bloqueios.tasksProprias.length})</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                  {bloqueios.tasksProprias.map(t => (
                    <div key={t.id} className={styles.membroRow}>
                      <div className={styles.membroInfo}>
                        <span className={styles.membroNome}>{t.codigo}</span>
                        <span className={styles.membroCargo}>{t.titulo}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {gerentes.filter(g => g.id !== alvoExclusao).map(g => (
                          <button key={g.id} className="fx-chip" onClick={() => handleReatribuirTask(t.id, g.id)}>
                            {g.nome.split(' ')[0]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {bloqueios.equipe.length === 0 && bloqueios.tasksProprias.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--fx-green)', textAlign: 'center' }}>
                Tudo reatribuído. Você já pode concluir a ação.
              </p>
            )}

            <button
              className="fx-btn-pill"
              style={{ width: '100%', height: 50, fontSize: 14 }}
              onClick={handleConcluirAcaoPendente}
              disabled={bloqueios.equipe.length > 0 || bloqueios.tasksProprias.length > 0}
            >
              {acaoPendente === 'excluir' ? 'Concluir exclusão' : 'Concluir rebaixamento'}
            </button>
          </div>
          </BottomSheet>
      )}
      {/* Bottom sheet: Editar cadastro */}
      {sheet === 'editar' && editUser && (
        <BottomSheet onClose={() => { setSheet(null); setEditUser(null); }} title="Editar dados">
          <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="fx-field">
              <input placeholder="Nome completo" value={editNome} onChange={e => setEditNome(e.target.value)} />
            </div>
            <div className="fx-field">
              <input type="email" placeholder="E-mail" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
            </div>
            <div className="fx-field">
              <input placeholder="Cargo (ex: Desenvolvedor, Design)" value={editCargo} onChange={e => setEditCargo(e.target.value)} />
            </div>
            {/* Define o que é "hoje" nos relatórios desta pessoa (G10). */}
            <div className="fx-field">
              <select value={editFuso} onChange={e => setEditFuso(e.target.value)}>
                {!FUSOS_COMUNS.some(f => f.valor === editFuso) && <option value={editFuso}>{editFuso}</option>}
                {FUSOS_COMUNS.map(f => <option key={f.valor} value={f.valor}>Fuso: {f.rotulo}</option>)}
              </select>
            </div>

            {editErro &&<p style={{ fontSize: 11.5, color: 'var(--fx-error)', textAlign: 'center' }}>{editErro}</p>}
            {editResetSucesso && <p style={{ fontSize: 11.5, color: 'var(--fx-green)', textAlign: 'center' }}>{editResetSucesso}</p>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="fx-btn-pill danger"
                style={{ flex: 1, height: 50, fontSize: 14, background: 'rgba(182, 71, 47, 0.1)', color: 'var(--fx-error)', border: '1px solid var(--fx-error)' }}
                onClick={handleResetSenha}
              >
                Resetar Senha
              </button>
              <button
                className="fx-btn-pill"
                style={{ flex: 1.5, height: 50, fontSize: 14 }}
                onClick={handleEditar}
                disabled={salvando}
              >
                {salvando ? <div className="fx-spinner" /> : 'Salvar dados'}
              </button>
            </div>
          </div>
        </BottomSheet>
      )}
    </>
  );
}
