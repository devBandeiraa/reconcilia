'use client';

import { HealthResponseSchema } from '@reconcilia/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/casos', label: 'Casos' },
  { href: '/saude', label: 'Saúde' },
];

function ApiStatus() {
  const health = useApi('/health', HealthResponseSchema, { pollMs: 30_000 });
  const [label, dot] = health.data
    ? [`API no ar · v${health.data.version}`, 'bg-emerald-400']
    : health.waking
      ? ['API acordando…', 'bg-amber-400 animate-pulse motion-reduce:animate-none']
      : health.error
        ? ['API fora do ar', 'bg-red-400']
        : ['Verificando a API…', 'bg-zinc-500'];
  return (
    <span className="text-muted-foreground flex items-center gap-2 text-xs" role="status">
      <span aria-hidden="true" className={cn('size-2 rounded-full', dot)} />
      {label}
    </span>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
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
        <div className="ml-auto">
          <ApiStatus />
        </div>
      </div>
    </header>
  );
}
