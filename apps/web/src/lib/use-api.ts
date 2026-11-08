'use client';

import { useCallback, useEffect, useState } from 'react';
import type { z } from 'zod';
import { apiRequest, isWakingError } from './api';

/** Depois disso sem resposta, a tela avisa que o servidor está acordando. */
const WAKING_AFTER_MS = 3_000;
/** Por quanto tempo continua tentando enquanto o servidor acorda. */
const WAKING_GIVE_UP_MS = 90_000;
const RETRY_EVERY_MS = 3_000;

export interface ApiState<T> {
  data?: T;
  error?: string;
  /** Primeira carga (sem dado ainda). Recargas e polling mantêm o dado anterior na tela. */
  loading: boolean;
  /** A api não respondeu em 3s: provavelmente acordando (plano gratuito). */
  waking: boolean;
  reload: () => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Busca `path` na api e valida com o schema. `null` não busca. `pollMs` busca de novo
 * periodicamente (ex.: enquanto o agente investiga).
 */
export function useApi<T>(
  path: string | null,
  schema: z.ZodType<T>,
  { pollMs }: { pollMs?: number } = {},
): ApiState<T> {
  const [state, setState] = useState<Omit<ApiState<T>, 'reload'>>({ loading: true, waking: false });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!path) {
      setState({ loading: false, waking: false });
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const startedAt = Date.now();
    const wakingTimer = setTimeout(() => {
      if (!cancelled) setState((s) => ({ ...s, waking: true }));
    }, WAKING_AFTER_MS);

    setState((s) => ({ ...s, loading: s.data === undefined, error: undefined }));

    void (async () => {
      for (;;) {
        try {
          const data = await apiRequest(path, schema, { signal: controller.signal });
          if (!cancelled) setState({ data, loading: false, waking: false });
          return;
        } catch (error) {
          if (cancelled) return;
          if (isWakingError(error) && Date.now() - startedAt < WAKING_GIVE_UP_MS) {
            setState((s) => ({ ...s, waking: true }));
            await sleep(RETRY_EVERY_MS);
            continue;
          }
          setState((s) => ({
            ...s,
            loading: false,
            waking: false,
            error: error instanceof Error ? error.message : String(error),
          }));
          return;
        }
      }
    })().finally(() => clearTimeout(wakingTimer));

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(wakingTimer);
    };
  }, [path, schema, version]);

  useEffect(() => {
    if (!pollMs || !path) return;
    const timer = setInterval(reload, pollMs);
    return () => clearInterval(timer);
  }, [pollMs, path, reload]);

  return { ...state, reload };
}
