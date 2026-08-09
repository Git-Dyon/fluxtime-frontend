export type Severidade = 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
export type Status = 'BACK_LOG' | 'ATUANDO' | 'EM_TESTES' | 'LIBERADO_PARA_QA' | 'DEPLOY' | 'CONCLUIDO';
export type Perfil = 'MANAGER_MASTER' | 'MANAGER' | 'USER';
export type TipoTask = 'COMUM' | 'ESPECIAL';

export interface User {
  id: string;
  nome: string;
  email: string;
  cargo: string;
  perfil: Perfil;
  gerenteId: string | null;
  gerenteNome?: string;
  totalUsuarios?: number;
  /** Senha ainda é a provisória entregue pelo master — a API bloqueia tudo até a troca. */
  precisaTrocarSenha?: boolean;
}

export interface Anexo {
  id: string;
  nome: string;
  mimeType: string;
  tamanho: number;
}

/**
 * O vínculo de uma pessoa com a task — cada responsável tem o próprio
 * cronômetro e o próprio total (G3: até 3 pessoas na mesma task).
 */
export interface Atribuicao {
  userId: string;
  nome: string;
  cargo: string;
  rodando: boolean;
  iniciadoEm: number | null;
  segundosExecutados: number;
}

export interface Task {
  id: string;
  codigo: string;
  titulo: string;
  descricao: string;
  empresa: string;
  projeto: string;
  severidade: Severidade;
  status: Status;
  horas: number;
  dataFinal: string;
  criadoEm: string;
  criadoPor: string | null;
  /** COMUM: task de trabalho normal. ESPECIAL: Daily/Reunião/Evento, fixa no rodapé (G4). */
  tipo: TipoTask;
  /** Dono da task especial — nulo em tasks comuns. */
  gerenteId: string | null;
  /** Posição fixa (1..3) no rodapé — só em tasks especiais. */
  ordemFixa: number | null;
  arquivada: boolean;
  criador: Pick<User, 'id' | 'nome'> | null;
  gerente: Pick<User, 'id' | 'nome'> | null;
  anexos: Anexo[];
  atribuicoes: Atribuicao[];
}

export interface TimeLog {
  id: string;
  inicio: string;
  fim: string | null;
  segundos: number;
  origem: 'CRONOMETRO' | 'MANUAL' | 'AJUSTE_GERENTE' | 'AUTO_STOP';
  motivoAjuste: string | null;
  ajustadoPorId: string | null;
  criadoEm: string;
  editadoEm: string | null;
  userId: string;
  task: { id: string; codigo: string; titulo: string };
}

export type TipoRequisicao = 'REMOVER_DA_EQUIPE' | 'MOVER_DE_EQUIPE' | 'ALTERAR_DADOS';
export type StatusRequisicao = 'PENDENTE' | 'APROVADA' | 'RECUSADA' | 'APLICADA_POR_PRAZO' | 'CANCELADA';

export interface Requisicao {
  id: string;
  tipo: TipoRequisicao;
  status: StatusRequisicao;
  abertaPorId: string;
  alvoId: string;
  /** Quem precisa responder. Nulo em ALTERAR_DADOS — aí quem decide é o master. */
  destinatarioId: string | null;
  gerenteDestinoId: string | null;
  abertaPor: Pick<User, 'id' | 'nome'>;
  alvo: Pick<User, 'id' | 'nome' | 'gerenteId'>;
  destinatario: Pick<User, 'id' | 'nome'> | null;
  gerenteDestino: Pick<User, 'id' | 'nome'> | null;
  payload: Record<string, string> | null;
  justificativa: string;
  prazoEm: string;
  resolvidoEm: string | null;
  observacao: string;
  criadoEm: string;
}

export interface UsuarioCongelado {
  id: string;
  nome: string;
  email: string;
  cargo: string;
  perfil: Perfil;
  congeladoEm: string;
  expurgoEm: string;
  congeladoPorNome: string | null;
  diasRestantes: number;
}

export interface AuthResponse {
  token: string;
  user: User;
}

/** Resposta de criação de usuário e de reset: a senha provisória aparece uma única vez. */
export interface SenhaProvisoriaResponse {
  ok?: boolean;
  senhaProvisoria: string;
}
