import { Severidade, Status } from './types';

export function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function formatSeconds(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function formatHM(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function deadlineClass(dataFinal: string, status: Status): 'green' | 'yellow' | 'orange' | 'red' {
  if (status === 'Concluído') return 'green';
  const diff = (new Date(dataFinal).getTime() - Date.now()) / 1000;
  if (diff > 3 * 86400) return 'green';
  if (diff > 1.5 * 86400) return 'yellow';
  if (diff > 0.5 * 86400) return 'orange';
  return 'red';
}

export function deadlineLabel(dataFinal: string): string {
  const diff = Math.floor((new Date(dataFinal).getTime() - Date.now()) / 86400000);
  if (diff < 0) return 'Vencida';
  if (diff === 0) return `Vence hoje · ${new Date(dataFinal).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  if (diff === 1) return 'Vence amanhã';
  return `Vence em ${diff} dias`;
}

export function severidadeColor(sev: Severidade): string {
  return { Baixa: 'green', Média: 'yellow', Alta: 'orange', Crítica: 'red' }[sev] as string;
}

export function calcTotalSeconds(task: { segundosExecutados: number; rodando: boolean; iniciadoEm: number | null }, now: number): number {
  const extra = task.rodando && task.iniciadoEm ? Math.floor((now - task.iniciadoEm) / 1000) : 0;
  return task.segundosExecutados + extra;
}
