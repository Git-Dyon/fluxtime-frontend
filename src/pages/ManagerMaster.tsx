import { useCallback, useEffect, useState } from 'react';
import { TitleBar } from '../components/TitleBar';
import { Avatar } from '../components/Avatar';
import { BottomSheet } from '../components/BottomSheet';
import { api, ApiError, clearToken } from '../lib/api';
import type { User } from '../lib/types';
import styles from './ManagerMaster.module.css';

interface Props {
  user: User;
  onLogout: () => void;
}

type Bloqueios = {
  equipe: { id: string; nome: string }[];
  tasksProprias: { id: string; codigo: string; titulo: string }[];
};

type Sheet = null | 'novo' | 'vincular' | 'reatribuir' | 'editar';

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

  const [editUser, setEditUser] = useState<User | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCargo, setEditCargo] = useState('');
  const [editErro, setEditErro] = useState('');
  const [editResetSucesso, setEditResetSucesso] = useState('');

  const load = useCallback(async () => {
    const [g, u] = await Promise.all([
      api.get<any[]>('/users/managers'),
      api.get<User[]>('/users'),
    ]);
    // Load teams for each manager
    const gerentesComEquipe = await Promise.all(
      g.map(async (ger: any) => {
        const team = await api.get<User[]>(`/users/team/${ger.id}`);
        return { ...ger, equipe: team };
      })
    );
    setGerentes(gerentesComEquipe);
    setUsuarios(u.filter((u: User) => u.perfil === 'USER'));
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
      await api.post('/users', { nome: novoNome, email: novoEmail, perfil: novoTipo, gerenteId: novoGerenteId || null });
      setSheet(null); setNovoNome(''); setNovoEmail(''); setNovoGerenteId('');
      await load();
    } catch (e: any) { setErro(e.message); }
    setSalvando(false);
  };

  const handleVincular = async (userId: string) => {
    await api.put(`/users/${userId}/assign`, { gerenteId: alvoGerente });
    setSheet(null); await load();
  };

  const handleDesvincular = async (userId: string) => {
    await api.put(`/users/${userId}/unassign`, {});
    await load();
  };

  const handlePromover = async (userId: string) => {
    await api.put(`/users/${userId}/promote`, {});
    await load();
  };

  const abrirBloqueio = (id: string, acao: 'excluir' | 'rebaixar', err: ApiError) => {
    setAlvoExclusao(id);
    setAcaoPendente(acao);
    setBloqueios(err.data?.bloqueios || { equipe: [], tasksProprias: [] });
    setSheet('reatribuir');
  };

  const handleExcluir = async (id: string) => {
    try {
      await api.delete(`/users/${id}`);
      if (id === alvoExclusao) setSheet(null);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) abrirBloqueio(id, 'excluir', e);
      else throw e;
    }
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

  const refreshBloqueios = useCallback(async () => {
    if (!alvoExclusao) return;
    const b = await api.get<Bloqueios>(`/users/${alvoExclusao}/deletion-blockers`);
    setBloqueios(b);
  }, [alvoExclusao]);

  const handleReatribuirMembro = async (userId: string, gerenteId: string) => {
    await api.put(`/users/${userId}/assign`, { gerenteId });
    await refreshBloqueios();
    await load();
  };

  const handleReatribuirTask = async (taskId: string, userId: string) => {
    await api.put(`/tasks/${taskId}/reassign`, { userId });
    await refreshBloqueios();
  };

  const handleConcluirAcaoPendente = () =>
    acaoPendente === 'excluir' ? handleExcluir(alvoExclusao) : handleRebaixar(alvoExclusao);

  const handleEditar = async () => {
    if (!editUser) return;
    if (!editNome.trim() || !editEmail.trim()) { setEditErro('Nome e e-mail são obrigatórios.'); return; }
    setSalvando(true); setEditErro(''); setEditResetSucesso('');
    try {
      await api.put(`/users/${editUser.id}`, { nome: editNome, email: editEmail, cargo: editCargo });
      setSheet(null); setEditUser(null);
      await load();
    } catch (e: any) { setEditErro(e.message); }
    setSalvando(false);
  };

  const handleResetSenha = async () => {
    if (!editUser) return;
    setEditErro(''); setEditResetSucesso('');
    try {
      await api.post(`/users/${editUser.id}/reset-password`, {});
      setEditResetSucesso('Senha resetada para timeflux@123 com sucesso!');
    } catch (e: any) { setEditErro(e.message); }
  };

  const handleLogout = () => { clearToken(); localStorage.removeItem('fx_token'); onLogout(); };

  const usuariosSemGerente = usuarios.filter(u => !u.gerenteId);

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
        <button className={styles.sairBtn} onClick={handleLogout} title="Sair">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <polyline points="3 3 3 8 8 8" />
          </svg>
        </button>
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
              <button className="fx-btn-sq" onClick={(e) => { e.stopPropagation(); setEditUser(g); setEditNome(g.nome); setEditEmail(g.email); setEditCargo(g.cargo || ''); setEditErro(''); setEditResetSucesso(''); setSheet('editar'); }} title="Editar gerente">
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
            <button className="fx-btn-sq" onClick={(e) => { e.stopPropagation(); setEditUser(u); setEditNome(u.nome); setEditEmail(u.email); setEditCargo(u.cargo || ''); setEditErro(''); setEditResetSucesso(''); setSheet('editar'); }} title="Editar usuário">
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
              Senha inicial: <strong>timeflux@123</strong>
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

            {editErro && <p style={{ fontSize: 11.5, color: 'var(--fx-error)', textAlign: 'center' }}>{editErro}</p>}
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
