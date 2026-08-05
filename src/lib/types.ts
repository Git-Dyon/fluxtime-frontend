export type Severidade = 'Baixa' | 'Média' | 'Alta' | 'Crítica';
export type Status = 'Back Log' | 'Atuando' | 'Em testes' | 'Liberado para QA' | 'Deploy' | 'Concluído';
export type Perfil = 'manager_master' | 'manager' | 'user';

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
  id: number;
  nome: string;
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
