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
  /** Define o que é "hoje" para esta pessoa nos relatórios e no fechamento do dia (G10). */
  timezone?: string;
}

/**
 * Toda listagem que pode crescer responde neste formato (G13).
 *
 * Antes vinha um array cru e o cliente carregava a coleção inteira a cada
 * refresh do painel.
 */
export interface Pagina<T> {
  itens: T[];
  total: number;
  pagina: number;
  limite: number;
  totalPaginas: number;
}

/** `/tasks` devolve as fixas à parte: são no máximo 3 e não entram na paginação (G4). */
export interface PaginaDeTasks extends Pagina<Task> {
  especiais: Task[];
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
  /** Faturável ao cliente (G16). Sempre `false` em tasks ESPECIAL. */
  faturavel: boolean;
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

// ---------------------------------------------------------------- Relatórios

export interface FiltroRelatorio {
  de: string;
  ate: string;
  userIds: string[];
  empresa: string;
  projeto: string;
  status: Status | '';
  severidade: Severidade | '';
  incluirEspeciais: boolean;
  /** '' = os dois; 'true' só faturável; 'false' só interno (G16). */
  faturavel: '' | 'true' | 'false';
}

export interface ResumoDia {
  dia: string;
  segundos: number;
  porPessoa: Array<{ nome: string; segundos: number }>;
}

export interface ResumoPessoa {
  userId: string;
  nome: string;
  segundos: number;
  segundosComuns: number;
  segundosEspeciais: number;
  /** Faturável ao cliente dentro do total desta pessoa (G16). */
  segundosFaturaveis: number;
  tasks: number;
  lancamentos: number;
  desligado: boolean;
}

export interface ResumoChave {
  chave: string;
  segundos: number;
  tasks: number;
}

export interface LinhaRelatorio {
  taskId: string;
  codigo: string;
  titulo: string;
  empresa: string;
  projeto: string;
  tipo: TipoTask;
  userId: string;
  userNome: string;
  status: Status;
  severidade: Severidade;
  /** Sempre `false` em tasks ESPECIAL (G16). */
  faturavel: boolean;
  horasEstimadas: number;
  horasNoPeriodo: number;
  horasAcumuladas: number;
  dataFinal: string;
  atrasada: boolean;
  lancamentos: number;
}

export interface LancamentoRelatorio {
  id: string;
  dia: string;
  inicio: string;
  fim: string | null;
  segundos: number;
  userNome: string;
  taskCodigo: string;
  taskTitulo: string;
  empresa: string;
  projeto: string;
  origem: TimeLog['origem'];
  ajustadoPorNome: string | null;
  motivoAjuste: string | null;
}

export interface Relatorio {
  escopo: 'equipe' | 'individual';
  titulo: string;
  geradoEm: string;
  timezone: string;
  periodo: { de: string | null; ate: string | null };
  filtros: {
    empresa: string | null; projeto: string | null;
    status: string | null; severidade: string | null; incluirEspeciais: boolean;
    faturavel: boolean | null;
  };
  horas: {
    totalSegundos: number;
    comumSegundos: number;
    especialSegundos: number;
    /** Faturável ao cliente — sempre ⊆ comumSegundos (G16). */
    faturavelSegundos: number;
    naoFaturavelSegundos: number;
    porDia: ResumoDia[];
    porPessoa: ResumoPessoa[];
    porProjeto: ResumoChave[];
    porEmpresa: ResumoChave[];
  };
  linhas: LinhaRelatorio[];
  /** Foto do backlog hoje — não muda com o período filtrado. */
  situacao: {
    totalTasks: number;
    concluidas: number;
    pendentes: number;
    atrasadas: number;
    horasEstimadas: number;
    horasAcumuladas: number;
    mediaRealVsEstimado: number;
    porStatus: Record<string, number>;
    porSeveridade: Record<string, number>;
  };
  lancamentos: LancamentoRelatorio[];
  lancamentosTruncados: boolean;
}

// ---------------------------------------------------------------- Auditoria

export interface EntradaAuditoria {
  id: string;
  atorId: string | null;
  atorNome: string;
  atorEmail: string;
  acao: string;
  acaoLabel: string;
  entidade: string;
  entidadeId: string;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  ip: string | null;
  requestId: string | null;
  criadoEm: string;
}

export interface PaginaDeAuditoria extends Pagina<EntradaAuditoria> {
  timezone: string;
}

export interface FacetasAuditoria {
  acoes: Array<{ valor: string; total: number; label: string }>;
  entidades: Array<{ valor: string; total: number }>;
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
