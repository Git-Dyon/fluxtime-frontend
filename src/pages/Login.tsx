import { useState } from 'react';
import { TitleBar } from '../components/TitleBar';
import { api } from '../lib/api';
import type { AuthResponse } from '../lib/types';
import styles from './Login.module.css';

interface Props {
  onLogin: (user: AuthResponse['user'], token: string, manterLogado: boolean) => void;
}

export function Login({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [keepLogged, setKeepLogged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState('');

  const handleLogin = async () => {
    if (loading) return;
    if (!email.trim() || !senha.trim()) {
      setAviso('Preencha o ID e a senha para continuar.');
      return;
    }
    setLoading(true);
    setAviso('');
    try {
      const data = await api.post<AuthResponse>('/auth/login', { email, senha });
      onLogin(data.user, data.token, keepLogged);
    } catch (e: any) {
      setAviso(e.message || 'Erro ao autenticar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <TitleBar />
      <div className={styles.content}>
        {/* Logo */}
        <div className={styles.logoArea}>
          <div className={styles.logoCircle}>
            <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
              <circle cx="17" cy="17" r="14" stroke="var(--fx-accent)" strokeWidth="2" />
              <line x1="17" y1="17" x2="17" y2="9.5" stroke="var(--fx-accent)" strokeWidth="2" strokeLinecap="round" />
              <line x1="17" y1="17" x2="22.5" y2="19.5" stroke="var(--fx-accent)" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div className={styles.logoText}>
            <h1 className={styles.logoName}>FluxTime</h1>
            <p className={styles.logoSub}>Controle de tempo</p>
          </div>
        </div>

        {/* Campos */}
        <div className={styles.fields}>
          <div className={styles.fieldPill}>
            <input
              type="email"
              placeholder="ID (e-mail)"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setAviso(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className={styles.input}
              id="login-email"
            />
          </div>

          <div className={styles.fieldPill}>
            <input
              type={showPass ? 'text' : 'password'}
              placeholder="Senha"
              value={senha}
              onChange={(e) => { setSenha(e.target.value); setAviso(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className={styles.input}
              id="login-senha"
            />
            <button
              className={styles.eyeBtn}
              onClick={() => setShowPass(!showPass)}
              title="Mostrar senha"
              tabIndex={-1}
            >
              <svg width="19" height="19" viewBox="0 0 20 20" fill="none">
                <path d="M1.6 10S4.7 4.6 10 4.6 18.4 10 18.4 10 15.3 15.4 10 15.4 1.6 10 1.6 10Z"
                  stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.6" />
                {!showPass && <line x1="3" y1="17" x2="17" y2="3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
              </svg>
            </button>
          </div>

          {/* Manter logado */}
          <div className={styles.keepRow} onClick={() => setKeepLogged(!keepLogged)}>
            <div className={`${styles.checkbox} ${keepLogged ? styles.checked : ''}`}>
              {keepLogged && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6.3 4.7 9 10 3.2" stroke="var(--fx-accent)" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span className={styles.keepLabel}>Manter logado</span>
          </div>
        </div>

        {/* Ações */}
        <div className={styles.actions}>
          {/* Reset é feito pelo Manager Master (G7 da auditoria: o autoatendimento
              por e-mail entra na V2, quando houver serviço de envio configurado). */}
          <a
            href="#"
            className={styles.forgotLink}
            onClick={(e) => {
              e.preventDefault();
              setAviso('Peça ao seu gerente ou ao administrador para redefinir a sua senha.');
            }}
          >
            Esqueci a minha senha
          </a>
          <button
            className={styles.loginBtn}
            onClick={handleLogin}
            disabled={loading}
            id="login-btn"
          >
            {loading ? (
              <div className="fx-spinner" />
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <rect x="2.8" y="7" width="10.4" height="7.2" rx="2"
                    stroke="var(--fx-accent)" strokeWidth="1.8" />
                  <path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7"
                    stroke="var(--fx-accent)" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <span>Entrar</span>
              </>
            )}
          </button>
        </div>

        {/* Aviso */}
        <div className={styles.avisoArea}>
          {aviso && <span className={styles.aviso}>{aviso}</span>}
        </div>
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <span>FluxTime Desktop · v1.0</span>
      </div>
    </>
  );
}
