import { type HealthResponse, HealthResponseSchema } from '@reconcilia/shared';
import { env } from '../env';

export const dynamic = 'force-dynamic';

async function getHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${env.API_URL}/health`, { cache: 'no-store' });
    if (!res.ok) return null;
    return HealthResponseSchema.parse(await res.json());
  } catch {
    return null;
  }
}

export default async function Home() {
  const health = await getHealth();

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-4 py-16">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Reconcilia</h1>
        <p className="text-zinc-400">
          Encontra pagamentos que não batem entre loja, gateway e ERP. Um agente de IA investiga
          cada caso. A IA sugere; uma pessoa aprova.
        </p>
      </header>

      <section
        aria-labelledby="status-api"
        className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5"
      >
        <h2 id="status-api" className="text-sm font-medium text-zinc-400">
          Status da API
        </h2>
        {health ? (
          <p role="status" className="mt-2 flex items-center gap-2 text-lg">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-emerald-400" />
            No ar · {health.service} v{health.version}
          </p>
        ) : (
          <p role="status" className="mt-2 flex items-center gap-2 text-lg">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-red-400" />
            Fora do ar em {env.API_URL}
          </p>
        )}
      </section>

      <p className="text-sm text-zinc-500">Versão 0.1.0 · as telas chegam na fase 9.</p>
    </main>
  );
}
