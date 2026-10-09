const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3741/api';

const CHAVE_TOKEN = 'fx_token';

let token: string | null = null;

/** Chamado quando a API responde 401: a sessão morreu, o app volta para o login. */
let aoPerderSessao: (() => void) | null = null;
export function onSessaoExpirada(cb: () => void) { aoPerderSessao = cb; }

export function setToken(t: string, persistir = false) {
  token = t;
  // Só grava em disco se o usuário marcou "manter logado". Caso contrário o token
  // vive apenas em memória e some ao fechar o app.
  if (persistir) localStorage.setItem(CHAVE_TOKEN, t);
}

export function getToken() { return token; }

export function loadStoredToken(): string | null {
  const salvo = localStorage.getItem(CHAVE_TOKEN);
  if (salvo) token = salvo;
  return salvo;
}

export function clearToken() {
  token = null;
  localStorage.removeItem(CHAVE_TOKEN);
}

export class ApiError extends Error {
  status: number;
  data: any;
  /** Presente em toda resposta de erro — é o que liga a falha à linha de log do servidor. */
  requestId?: string;
  constructor(status: number, message: string, data: any) {
    super(message);
    this.status = status;
    this.data = data;
    this.requestId = data?.requestId;
  }
}

/** O backend responde 403 com este código enquanto a senha for a provisória. */
export const CODIGO_SENHA_PROVISORIA = 'SENHA_PROVISORIA';

function cabecalhos(extra: Record<string, string> = {}): Record<string, string> {
  const h = { ...extra };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function interpretar(res: Response): Promise<any> {
  // 204 e respostas vazias não têm corpo JSON.
  const texto = await res.text();
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return { erro: texto };
  }
}

async function lidarComFalha(res: Response): Promise<never> {
  const data = await interpretar(res);
  if (res.status === 401) {
    clearToken();
    aoPerderSessao?.();
  }
  throw new ApiError(res.status, data?.erro || 'Erro na requisição', data);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: cabecalhos({ 'Content-Type': 'application/json' }),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) await lidarComFalha(res);
  return (await interpretar(res)) as T;
}

export async function uploadFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('arquivo', file);

  // Sem Content-Type manual: o browser precisa gerar o boundary do multipart.
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: cabecalhos(), body: form });
  if (!res.ok) await lidarComFalha(res);
  return (await interpretar(res)) as T;
}

export async function downloadFile(path: string, filename: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { headers: cabecalhos() });
  if (!res.ok) await lidarComFalha(res);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get:    <T>(path: string) => request<T>('GET', path),
  post:   <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put:    <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
