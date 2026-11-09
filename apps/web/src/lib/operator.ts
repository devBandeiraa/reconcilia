'use client';

import { type SessionResponse, SessionResponseSchema } from '@reconcilia/shared';
import { useSyncExternalStore } from 'react';
import { apiRequest } from './api';

/**
 * Sessão de operador da demo: o nome escolhido e o token assinado pela api (24h). Fica no
 * localStorage; sem ele (aba privada, bloqueio), vale só enquanto a página estiver aberta.
 * É identificação de demo, não autenticação.
 */
const KEY = 'reconcilia:operator';
/** Margem para não mandar um token que expira no meio da requisição. */
const EXPIRY_MARGIN_MS = 60_000;

let memory: string | null = null;
let cachedRaw: string | null | undefined;
let cachedSession: SessionResponse | null = null;
const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return memory;
  }
}

function writeRaw(raw: string | null) {
  memory = raw;
  try {
    if (raw === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, raw);
  } catch {
    // sem armazenamento: fica só na memória
  }
  listeners.forEach((listener) => listener());
}

function parse(raw: string | null): SessionResponse | null {
  if (!raw) return null;
  try {
    const session = SessionResponseSchema.parse(JSON.parse(raw));
    return Date.parse(session.expiresAt) - Date.now() > EXPIRY_MARGIN_MS ? session : null;
  } catch {
    return null;
  }
}

/** A sessão atual (válida), ou null. O objeto é estável enquanto o armazenado não muda. */
export function currentOperator(): SessionResponse | null {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedSession = parse(raw);
  }
  return cachedSession;
}

/** Pede o token à api para o nome escolhido e guarda a sessão. */
export async function startOperatorSession(operator: string): Promise<SessionResponse> {
  const session = await apiRequest('/session', SessionResponseSchema, {
    method: 'POST',
    body: { operator },
  });
  writeRaw(JSON.stringify(session));
  return session;
}

export function endOperatorSession() {
  writeRaw(null);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => event.key === KEY && listener();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Operador atual, atualizado quando muda nesta aba ou em outra. No servidor, sempre null. */
export function useOperator(): SessionResponse | null {
  return useSyncExternalStore(subscribe, currentOperator, () => null);
}
