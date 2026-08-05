import React from 'react';
import { electronAPI } from '../lib/electron';
import styles from './TitleBar.module.css';

export function TitleBar() {
  const api = electronAPI();

  return (
    <div className={styles.bar}>
      <span className={styles.label}>FluxTime</span>
      <div className={styles.controls}>
        <button
          className={styles.btn}
          onClick={() => api ? api.minimize() : undefined}
          title="Minimizar"
          aria-label="Minimizar"
        >
          —
        </button>
        <button
          className={`${styles.btn} ${styles.close}`}
          onClick={() => api ? api.close() : undefined}
          title="Fechar"
          aria-label="Fechar"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
