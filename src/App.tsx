import { useEffect, useState } from 'react';
import { Login } from './pages/Login';
import { ManagerMaster } from './pages/ManagerMaster';
import { Manager } from './pages/Manager';
import { User as UserPage } from './pages/User';
import type { User } from './lib/types';
import { api, setToken } from './lib/api';
import { connectSocket, disconnectSocket } from './lib/socket';
import './styles/global.css';

type AuthState = { user: User; token: string } | null;

export function App() {
  const [auth, setAuth] = useState<AuthState>(null);
  const [checking, setChecking] = useState(true);

  // Auto-login if token saved in localStorage
  useEffect(() => {
    const saved = localStorage.getItem('fx_token');
    if (saved) {
      setToken(saved);
      // Try to verify token validity via health endpoint
      api.get<unknown>('/health').then(() => {
        // Token seems ok, we need user data — store user in localStorage too
        const savedUser = localStorage.getItem('fx_user');
        if (savedUser) {
          const user = JSON.parse(savedUser) as User;
          if (user.perfil !== 'MANAGER_MASTER') connectSocket(saved);
          setAuth({ user, token: saved });
        } else {
          localStorage.removeItem('fx_token');
        }
      }).catch(() => {
        localStorage.removeItem('fx_token');
        localStorage.removeItem('fx_user');
      }).finally(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, []);

  const handleLogin = (user: User, token: string) => {
    localStorage.setItem('fx_user', JSON.stringify(user));
    if (user.perfil !== 'MANAGER_MASTER') connectSocket(token);
    setAuth({ user, token });
  };

  const handleLogout = () => {
    disconnectSocket();
    localStorage.removeItem('fx_token');
    localStorage.removeItem('fx_user');
    setAuth(null);
  };

  if (checking) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--fx-surface)' }}>
        <div className="fx-spinner" />
      </div>
    );
  }

  const renderPage = () => {
    if (!auth) return <Login onLogin={handleLogin} />;
    switch (auth.user.perfil) {
      case 'MANAGER_MASTER': return <ManagerMaster user={auth.user} onLogout={handleLogout} />;
      case 'MANAGER': return <Manager user={auth.user} onLogout={handleLogout} />;
      case 'USER': return <UserPage user={auth.user} onLogout={handleLogout} />;
      default: return <Login onLogin={handleLogin} />;
    }
  };

  return (
    <div className="app-window">
      {renderPage()}
    </div>
  );
}
