import type { Atribuicao, Severidade, Status, Task } from './types';

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

export const STATUS_LABELS: Record<Status, string> = {
  BACK_LOG: 'Back Log',
  ATUANDO: 'Atuando',
  EM_TESTES: 'Em testes',
  LIBERADO_PARA_QA: 'Liberado para QA',
  DEPLOY: 'Deploy',
  CONCLUIDO: 'Concluído',
};

export const SEVERIDADE_LABELS: Record<Severidade, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  CRITICA: 'Crítica',
};

export function deadlineClass(dataFinal: string, status: Status): 'green' | 'yellow' | 'orange' | 'red' {
  if (status === 'CONCLUIDO') return 'green';
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
  if (diff > 1000) return 'Sem prazo'; // tasks especiais (G4): dataFinal fica ~100 anos no futuro
  return `Vence em ${diff} dias`;
}

export function severidadeColor(sev: Severidade): string {
  return { BAIXA: 'green', MEDIA: 'yellow', ALTA: 'orange', CRITICA: 'red' }[sev] as string;
}

/** Segundos acumulados de UM vínculo, somando a sessão em curso se estiver rodando. */
export function calcAtribuicaoSeconds(a: Pick<Atribuicao, 'segundosExecutados' | 'rodando' | 'iniciadoEm'>, now: number): number {
  const extra = a.rodando && a.iniciadoEm ? Math.floor((now - a.iniciadoEm) / 1000) : 0;
  return a.segundosExecutados + extra;
}

/** Vínculo de uma pessoa específica numa task, ou undefined se ela não for responsável. */
export function minhaAtribuicao(task: Task, userId: string): Atribuicao | undefined {
  return task.atribuicoes.find((a) => a.userId === userId);
}

/** Segundos de UM responsável específico numa task — o caso comum ao renderizar "minha" task. */
export function calcMeusSegundos(task: Task, userId: string, now: number): number {
  const a = minhaAtribuicao(task, userId);
  return a ? calcAtribuicaoSeconds(a, now) : 0;
}

/** Soma de todos os responsáveis — visão do gerente sobre o total investido na task. */
export function calcTotalSeconds(task: Task, now: number): number {
  return task.atribuicoes.reduce((s, a) => s + calcAtribuicaoSeconds(a, now), 0);
}

/** true se QUALQUER responsável estiver com o cronômetro rodando nesta task. */
export function algumRodando(task: Task): boolean {
  return task.atribuicoes.some((a) => a.rodando);
}

// ------------------------------------------------------------ Datas e fuso

/**
 * "AAAA-MM-DD" do dia de hoje no fuso informado.
 *
 * Os atalhos de período do relatório precisam concordar com o backend, que
 * resolve as bordas do dia no fuso do usuário (G10). Usar `new Date()` local
 * do navegador faria o botão "hoje" pedir o dia errado para quem viaja ou
 * configurou outro fuso no perfil.
 */
export function diaEm(instante: Date, timezone: string): string {
  try {
    // en-CA formata como AAAA-MM-DD, que é exatamente o formato da API.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(instante);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(instante);
  }
}

/** Desloca um dia "AAAA-MM-DD" em N dias, sem passar por fuso nenhum. */
export function somarDias(dia: string, dias: number): string {
  const [a, m, d] = dia.split('-').map(Number);
  const base = new Date(Date.UTC(a, m - 1, d + dias));
  return base.toISOString().slice(0, 10);
}

/** Primeiro dia do mês a que "AAAA-MM-DD" pertence. */
export function primeiroDiaDoMes(dia: string): string {
  return `${dia.slice(0, 7)}-01`;
}

/** "AAAA-MM-DD" → "DD/MM". Rótulo curto para eixo e listas densas. */
export function diaCurto(dia: string): string {
  const [, m, d] = dia.split('-');
  return `${d}/${m}`;
}

/** "AAAA-MM-DD" → "DD/MM/AAAA". */
export function diaBonito(dia: string): string {
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}`;
}

/** Instante ISO → "DD/MM/AAAA HH:MM" no fuso pedido. */
export function dataHoraEm(iso: string, timezone: string): string {
  const d = new Date(iso);
  try {
    return d.toLocaleString('pt-BR', {
      timeZone: timezone, day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return d.toLocaleString('pt-BR');
  }
}

export const ORIGEM_LABELS: Record<string, string> = {
  CRONOMETRO: 'Cronômetro',
  MANUAL: 'Lançamento manual',
  AJUSTE_GERENTE: 'Ajuste do gerente',
  AUTO_STOP: 'Encerrado pelo sistema',
};

/**
 * Fusos oferecidos no seletor.
 *
 * Lista curta de propósito: o `Intl.supportedValuesOf('timeZone')` traz mais de
 * 400 entradas e transforma uma preferência de dois cliques numa busca. O
 * backend aceita qualquer identificador IANA — isto é só o atalho.
 */
export const FUSOS_COMUNS = [
  { valor: 'America/Sao_Paulo', rotulo: 'São Paulo (BRT)' },
  { valor: 'America/Manaus', rotulo: 'Manaus (AMT)' },
  { valor: 'America/Rio_Branco', rotulo: 'Rio Branco (ACT)' },
  { valor: 'America/Noronha', rotulo: 'Fernando de Noronha' },
  { valor: 'America/New_York', rotulo: 'Nova York (ET)' },
  { valor: 'America/Los_Angeles', rotulo: 'Los Angeles (PT)' },
  { valor: 'Europe/Lisbon', rotulo: 'Lisboa (WET)' },
  { valor: 'Europe/London', rotulo: 'Londres (GMT)' },
  { valor: 'Europe/Berlin', rotulo: 'Berlim (CET)' },
  { valor: 'Asia/Tokyo', rotulo: 'Tóquio (JST)' },
  { valor: 'UTC', rotulo: 'UTC' },
];
