import { useCallback, useEffect, useState } from 'react';
import { Login } from './pages/Login';
import { TrocarSenha } from './pages/TrocarSenha';
import { ManagerMaster } from './pages/ManagerMaster';
import { Manager } from './pages/Manager';
import { User as UserPage } from './pages/User';
import type { User } from './lib/types';
import { api, clearToken, getToken, loadStoredToken, onSessaoExpirada, setToken } from './lib/api';
import { connectSocket, disconnectSocket } from './lib/socket';
import './styles/global.css';

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [verificando, setVerificando] = useState(true);

  const encerrarSessao = useCallback(() => {
    disconnectSocket();
    clearToken();
    setUser(null);
  }, []);

  // Qualquer 401 vindo da API derruba a sessão — token expirado, revogado por troca
  // de senha, ou conta desativada pelo master enquanto o app estava aberto.
  useEffect(() => { onSessaoExpirada(encerrarSessao); }, [encerrarSessao]);

  const abrirSessao = useCallback((u: User) => {
    // MANAGER_MASTER não recebe eventos de task — o socket recusa esse perfil.
    if (u.perfil !== 'MANAGER_MASTER' && !u.precisaTrocarSenha) {
      const t = getToken();
      if (t) connectSocket(t);
    }
    setUser(u);
  }, []);

  /**
   * Retomada de sessão.
   *
   * A versão anterior validava o token salvo chamando /api/health — que é público
   * e responde 200 para qualquer um — e depois confiava no perfil gravado em
   * localStorage para escolher a tela. Agora quem diz quem é o usuário é o servidor.
   */
  useEffect(() => {
    const salvo = loadStoredToken();
    if (!salvo) {
      setVerificando(false);
      return;
    }

    api.get<User>('/auth/me')
      .then(abrirSessao)
      .catch(() => clearToken())
      .finally(() => setVerificando(false));
  }, [abrirSessao]);

  const handleLogin = (u: User, token: string, manterLogado: boolean) => {
    setToken(token, manterLogado);
    abrirSessao(u);
  };

  // Após trocar a senha provisória, relê o perfil do servidor: é ele quem confirma
  // que precisaTrocarSenha caiu, não uma suposição do cliente.
  const handleSenhaTrocada = useCallback(async () => {
    try {
      abrirSessao(await api.get<User>('/auth/me'));
    } catch {
      encerrarSessao();
    }
  }, [abrirSessao, encerrarSessao]);

  /**
   * O usuário mexeu numa preferência (hoje, o fuso) — relê o perfil do servidor
   * em vez de remendar o objeto local, pelo mesmo motivo de `handleSenhaTrocada`:
   * quem diz o estado da conta é a API.
   */
  const handlePerfilAtualizado = useCallback(async () => {
    try {
      setUser(await api.get<User>('/auth/me'));
    } catch {
      /* silêncio: um 401 já derruba a sessão pelo onSessaoExpirada */
    }
  }, []);

  if (verificando) {
    return (
      <div className="app-window">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--fx-surface)' }}>
          <div className="fx-spinner" />
        </div>
      </div>
    );
  }

  const renderPage = () => {
    if (!user) return <Login onLogin={handleLogin} />;

    // A API recusa todas as rotas de negócio nesse estado; mostrar qualquer outra
    // tela só produziria uma sequência de erros 403.
    if (user.precisaTrocarSenha) {
      return <TrocarSenha email={user.email} onPronto={handleSenhaTrocada} onCancelar={encerrarSessao} />;
    }

    switch (user.perfil) {
      case 'MANAGER_MASTER': return <ManagerMaster user={user} onLogout={encerrarSessao} />;
      case 'MANAGER':        return <Manager user={user} onLogout={encerrarSessao} onPerfilAtualizado={handlePerfilAtualizado} />;
      case 'USER':           return <UserPage user={user} onLogout={encerrarSessao} />;
      default:               return <Login onLogin={handleLogin} />;
    }
  };

  return <div className="app-window">{renderPage()}</div>;
}
