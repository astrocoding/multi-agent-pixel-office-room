import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@agent-office/shared';

// Use explicit env var if set, otherwise fallback to window.location.origin (which uses Vite's proxy) or localhost:3001
const getSocketUrl = (): string => {
  if (import.meta.env.VITE_SERVER_URL) {
    return import.meta.env.VITE_SERVER_URL;
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://127.0.0.1:3001';
};

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(getSocketUrl(), {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 4000,
  timeout: 10000,
  transports: ['websocket', 'polling'],
});

socket.on('connect', () => {
  console.log(`[Socket.IO Client] Connected to server: ${socket.id}`);
});

socket.on('connect_error', (err) => {
  console.warn(`[Socket.IO Client] Connect error:`, err.message);
});

socket.on('disconnect', (reason) => {
  console.log(`[Socket.IO Client] Disconnected: ${reason}`);
});
