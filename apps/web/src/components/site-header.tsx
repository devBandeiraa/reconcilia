'use client';

import { HealthResponseSchema } from '@reconcilia/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { endOperatorSession, useOperator } from '@/lib/operator';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/casos', label: 'Casos' },
  { href: '/saude', label: 'Saúde' },
];

function ApiStatus() {
  const health = useApi('/health', HealthResponseSchema, { pollMs: 30_000 });
  const [label, dot] = health.data
    ? ['API no ar', 'bg-status-ok']
    : health.waking
      ? ['API acordando…', 'bg-status-attention animate-pulse motion-reduce:animate-none']
      : health.error
        ? ['API fora do ar', 'bg-destructive']
        : ['Verificando a API…', 'bg-status-muted'];
  return (
    <span className="text-muted-foreground flex items-center gap-2 text-xs" role="status">
      <span aria-hidden="true" className={cn('size-2 rounded-full', dot)} />
      {label}
      {health.data && <span className="hidden sm:inline">· v{health.data.version}</span>}
    </span>
  );
}

/** Quem está decidindo nesta demo (token de operador). Some quando não há sessão. */
function OperatorIndicator() {
  const operator = useOperator();
  if (!operator) return null;
  return (
    <span className="text-muted-foreground hidden items-center gap-1 text-xs sm:flex">
      Operador: <span className="text-foreground">{operator.operator}</span>
      <button
        type="button"
        onClick={endOperatorSession}
        className="hover:text-foreground underline underline-offset-2"
      >
        sair
      </button>
    </span>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6">
        <Link href="/casos" className="font-semibold tracking-tight">
          Reconcilia
        </Link>
        <nav aria-label="Principal" className="flex gap-1">
          {LINKS.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <OperatorIndicator />
          <ApiStatus />
        </div>
      </div>
    </header>
  );
}
