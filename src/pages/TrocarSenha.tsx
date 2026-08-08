import { useState } from 'react';
import { TitleBar } from '../components/TitleBar';
import { api, setToken } from '../lib/api';
import styles from './Login.module.css';

interface Props {
  /** Exibido no topo para o usuário saber em qual conta está. */
  email: string;
  onPronto: () => void;
  onCancelar: () => void;
}

/**
 * Troca obrigatória da senha provisória.
 *
 * A API bloqueia todas as rotas de negócio enquanto `precisaTrocarSenha` for true,
 * então esta tela é a única saída — daí o botão "Sair" em vez de um "pular".
 */
export function TrocarSenha({ email, onPronto, onCancelar }: Props) {
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState('');

  const handleSalvar = async () => {
    if (carregando) return;
    if (!senhaAtual || !novaSenha) {
      setAviso('Preencha a senha atual e a nova senha.');
      return;
    }
    if (novaSenha !== confirmacao) {
      setAviso('A confirmação não confere com a nova senha.');
      return;
    }

    setCarregando(true);
    setAviso('');
    try {
      // A troca invalida todas as sessões, inclusive esta — o backend devolve um
      // token novo para que o usuário siga logado sem digitar as credenciais outra vez.
      const r = await api.post<{ token: string }>('/auth/change-password', { senhaAtual, novaSenha });
      setToken(r.token, Boolean(localStorage.getItem('fx_token')));
      onPronto();
    } catch (e: any) {
      setAviso(e.message || 'Não foi possível alterar a senha.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <>
      <TitleBar />
      <div className={styles.content}>
        <div className={styles.logoArea}>
          <div className={styles.logoCircle}>
            <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
              <rect x="8" y="15" width="18" height="12.5" rx="3"
                stroke="var(--fx-accent)" strokeWidth="2.2" />
              <path d="M12.5 15v-3.2a4.5 4.5 0 0 1 9 0V15"
                stroke="var(--fx-accent)" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </div>
          <div className={styles.logoText}>
            <h1 className={styles.logoName}>Defina sua senha</h1>
            <p className={styles.logoSub}>{email}</p>
          </div>
        </div>

        <div className={styles.fields}>
          <div className={styles.fieldPill}>
            <input
              type={mostrar ? 'text' : 'password'}
              placeholder="Senha provisória"
              value={senhaAtual}
              onChange={(e) => { setSenhaAtual(e.target.value); setAviso(''); }}
              className={styles.input}
              autoFocus
            />
          </div>

          <div className={styles.fieldPill}>
            <input
              type={mostrar ? 'text' : 'password'}
              placeholder="Nova senha (mín. 10 caracteres)"
              value={novaSenha}
              onChange={(e) => { setNovaSenha(e.target.value); setAviso(''); }}
              className={styles.input}
            />
            <button
              className={styles.eyeBtn}
              onClick={() => setMostrar(!mostrar)}
              title="Mostrar senhas"
              tabIndex={-1}
            >
              <svg width="19" height="19" viewBox="0 0 20 20" fill="none">
                <path d="M1.6 10S4.7 4.6 10 4.6 18.4 10 18.4 10 15.3 15.4 10 15.4 1.6 10 1.6 10Z"
                  stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.6" />
                {!mostrar && <line x1="3" y1="17" x2="17" y2="3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
              </svg>
            </button>
          </div>

          <div className={styles.fieldPill}>
            <input
              type={mostrar ? 'text' : 'password'}
              placeholder="Repita a nova senha"
              value={confirmacao}
              onChange={(e) => { setConfirmacao(e.target.value); setAviso(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSalvar()}
              className={styles.input}
            />
          </div>
        </div>

        <div className={styles.actions}>
          <a
            href="#"
            className={styles.forgotLink}
            onClick={(e) => { e.preventDefault(); onCancelar(); }}
          >
            Sair
          </a>
          <button className={styles.loginBtn} onClick={handleSalvar} disabled={carregando}>
            {carregando ? <div className="fx-spinner" /> : <span>Salvar e entrar</span>}
          </button>
        </div>

        <div className={styles.avisoArea}>
          {aviso && <span className={styles.aviso}>{aviso}</span>}
        </div>
      </div>

      <div className={styles.footer}>
        <span>FluxTime Desktop · v1.0</span>
      </div>
    </>
  );
}
