import { useState } from 'react';
import type { Task } from '../lib/types';
import { calcMeusSegundos, formatHM, minhaAtribuicao } from '../lib/utils';
import styles from './EspeciaisBar.module.css';

interface Props {
  /** Já filtradas para tipo === 'ESPECIAL', ordenadas por ordemFixa. */
  especiais: Task[];
  userId: string;
  now: number;
  onStart: (taskId: string) => void;
  onStop: (taskId: string) => void;
  /** Só o gerente dono pode renomear — "gerente pode alterar esses nomes". */
  onRenomear?: (taskId: string, novoTitulo: string) => void;
}

/**
 * Daily, Reunião, Evento — fixas no rodapé do painel, do gerente e dos users
 * (G4). Cada uma tem o próprio play/pause independente das tasks comuns: a
 * regra de concorrência (G5) só impede duas do mesmo tipo ao mesmo tempo.
 */
export function EspeciaisBar({ especiais, userId, now, onStart, onStop, onRenomear }: Props) {
  const [renomeandoId, setRenomeandoId] = useState<string | null>(null);
  const [novoTitulo, setNovoTitulo] = useState('');

  if (especiais.length === 0) return null;

  const confirmarRenomear = (taskId: string) => {
    const titulo = novoTitulo.trim();
    if (titulo) onRenomear?.(taskId, titulo);
    setRenomeandoId(null);
  };

  return (
    <div className={styles.bar}>
      {especiais.map((t) => {
        const minha = minhaAtribuicao(t, userId);
        if (!minha) return null;
        const segundos = calcMeusSegundos(t, userId, now);

        if (renomeandoId === t.id) {
          return (
            <div key={t.id} className={styles.chip}>
              <input
                autoFocus
                className={styles.renameInput}
                value={novoTitulo}
                onChange={(e) => setNovoTitulo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmarRenomear(t.id);
                  if (e.key === 'Escape') setRenomeandoId(null);
                }}
                onBlur={() => confirmarRenomear(t.id)}
              />
            </div>
          );
        }

        return (
          <div key={t.id} className={styles.chip}>
            <div
              className={styles.info}
              onDoubleClick={() => {
                if (!onRenomear) return;
                setNovoTitulo(t.titulo);
                setRenomeandoId(t.id);
              }}
              title={onRenomear ? 'Clique duas vezes para renomear' : undefined}
            >
              <span className={styles.titulo}>{t.titulo}</span>
              <span className={`${styles.timer} fx-tabular`}>{formatHM(segundos)}</span>
            </div>
            <button
              className={`${styles.playBtn} ${minha.rodando ? styles.playing : ''}`}
              onClick={() => (minha.rodando ? onStop(t.id) : onStart(t.id))}
              title={minha.rodando ? 'Pausar' : 'Iniciar'}
            >
              {minha.rodando ? (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <rect x="3" y="3" width="3.5" height="10" rx="1" fill="var(--fx-accent)" />
                  <rect x="9.5" y="3" width="3.5" height="10" rx="1" fill="var(--fx-accent)" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M5 3l8 5-8 5V3z" fill="var(--fx-accent)" />
                </svg>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
