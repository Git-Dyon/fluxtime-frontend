import { io, Socket } from 'socket.io-client';

const BASE = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3741';

export const TASK_EVENTS = [
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_STARTED',
  'TASK_STOPPED',
  'TASK_TIME_ADJUSTED',
  'TASK_DELETED',
  'ANEXO_ADDED',
  'ANEXO_DELETED',
] as const;

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  if (socket) socket.disconnect();
  socket = io(BASE, { auth: { token }, transports: ['websocket'] });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}

export function subscribeTaskEvents(onEvent: () => void): () => void {
  const s = getSocket();
  if (!s) return () => {};
  TASK_EVENTS.forEach((ev) => s.on(ev, onEvent));
  return () => { TASK_EVENTS.forEach((ev) => s.off(ev, onEvent)); };
}
