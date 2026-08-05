import React from 'react';
import { initials } from '../lib/utils';
import styles from './Avatar.module.css';

interface Props {
  nome: string;
  size?: number;
  inset?: boolean;
  className?: string;
}

export function Avatar({ nome, size = 40, inset = false, className = '' }: Props) {
  const ini = initials(nome);
  return (
    <div
      className={`${styles.avatar} ${inset ? styles.inset : styles.raised} ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.35 }}
      aria-label={nome}
    >
      {ini}
    </div>
  );
}
