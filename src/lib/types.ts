export type Severidade = 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
export type Status = 'BACK_LOG' | 'ATUANDO' | 'EM_TESTES' | 'LIBERADO_PARA_QA' | 'DEPLOY' | 'CONCLUIDO';
export type Perfil = 'MANAGER_MASTER' | 'MANAGER' | 'USER';

export interface User {
  id: string;
  nome: string;
  email: string;
  cargo: string;
  perfil: Perfil;
  gerenteId: string | null;
  gerenteNome?: string;
  totalUsuarios?: number;
}

export interface Anexo {
  id: string;
  nome: string;
  mimeType: string;
  tamanho: number;
}

export interface Task {
  id: string;
  titulo: string;
  descricao: string;
  empresa: string;
  projeto: string;
  userId: string | null;
  severidade: Severidade;
  status: Status;
  horas: number;
  dataFinal: string;
  segundosExecutados: number;
  rodando: boolean;
  iniciadoEm: number | null;
  criadoPor: string | null;
  user: Pick<User, 'id' | 'nome' | 'cargo'> | null;
  creator: Pick<User, 'id' | 'nome'> | null;
  anexos: Anexo[];
}

export interface AuthResponse {
  token: string;
  user: User;
}
