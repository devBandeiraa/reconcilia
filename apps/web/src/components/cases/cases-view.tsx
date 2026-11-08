'use client';

import {
  CASE_TYPES,
  type CasePage,
  CasePageSchema,
  type CaseStatus,
  type CaseType,
  ReconciliationResultSchema,
  SimulationResultSchema,
} from '@reconcilia/shared';
import { ChevronLeft, ChevronRight, Loader2, Scale, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { CASE_TYPE_ACCENT, CaseStatusBadge, CaseTypeBadge } from '@/components/badges';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatusMessage,
  WakingNotice,
} from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiRequest } from '@/lib/api';
import { brl, CASE_TYPE_LABEL, relativeTime } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;
type TypeFilter = CaseType | 'ALL';
type StatusFilter = CaseStatus | 'ALL';

function useCount(type: CaseType | null, status: CaseStatus, version: number) {
  const params = new URLSearchParams({ status, limit: '1', v: String(version) });
  if (type) params.set('type', type);
  return useApi(`/cases?${params}`, CasePageSchema).data?.pagination.total;
}

function CounterCard({
  label,
  hint,
  value,
  accent,
  pressed,
  onClick,
}: {
  label: string;
  hint: string;
  value: number | undefined;
  accent: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={cn(
        'bg-card hover:bg-muted/50 focus-visible:ring-ring flex flex-col justify-between rounded-lg border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none',
        pressed && 'ring-ring ring-2',
      )}
    >
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="mt-1 flex items-baseline gap-2">
        <span className={cn('text-3xl font-semibold tabular-nums', accent)}>{value ?? '–'}</span>
        <span className="text-muted-foreground text-xs">{hint}</span>
      </span>
    </button>
  );
}

function CasesTable({ page }: { page: CasePage }) {
  return (
    <>
      {/* Desktop: tabela. */}
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>Pedido</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Detectado</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.data.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <Link
                  href={`/casos/${c.id}`}
                  className="font-mono font-medium underline-offset-4 hover:underline"
                >
                  {c.orderExternalId}
                </Link>
              </TableCell>
              <TableCell>
                <CaseTypeBadge type={c.type} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{brl(c.amountCents)}</TableCell>
              <TableCell className="text-muted-foreground">
                <time dateTime={c.detectedAt} title={c.detectedAt}>
                  {relativeTime(c.detectedAt)}
                </time>
              </TableCell>
              <TableCell>
                <CaseStatusBadge status={c.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Celular: cartões. */}
      <ul className="space-y-2 md:hidden">
        {page.data.map((c) => (
          <li key={c.id}>
            <Link
              href={`/casos/${c.id}`}
              className="bg-card hover:bg-muted/50 focus-visible:ring-ring block rounded-lg border p-3 focus-visible:ring-2 focus-visible:outline-none"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-medium">{c.orderExternalId}</span>
                <span className="tabular-nums">{brl(c.amountCents)}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <CaseTypeBadge type={c.type} />
                <CaseStatusBadge status={c.status} />
                <span className="text-muted-foreground">{relativeTime(c.detectedAt)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function CasesView() {
  const [type, setType] = useState<TypeFilter>('ALL');
  const [status, setStatus] = useState<StatusFilter>('OPEN');
  const [offset, setOffset] = useState(0);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState<'simulate' | 'reconcile' | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);

  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(offset),
    v: String(version),
  });
  if (type !== 'ALL') params.set('type', type);
  if (status !== 'ALL') params.set('status', status);
  const cases = useApi(`/cases?${params}`, CasePageSchema);

  const counts = {
    PAYMENT_WITHOUT_ORDER: useCount('PAYMENT_WITHOUT_ORDER', 'OPEN', version),
    DUPLICATE_WEBHOOK: useCount('DUPLICATE_WEBHOOK', 'OPEN', version),
    AMOUNT_MISMATCH: useCount('AMOUNT_MISMATCH', 'OPEN', version),
  };
  const resolved = useCount(null, 'RESOLVED', version);

  const refresh = () => setVersion((v) => v + 1);
  const filter = (nextType: TypeFilter, nextStatus: StatusFilter) => {
    setType(nextType);
    setStatus(nextStatus);
    setOffset(0);
  };

  async function run(kind: 'simulate' | 'reconcile') {
    setBusy(kind);
    setMessage(null);
    try {
      if (kind === 'simulate') {
        const result = await apiRequest('/simulate', SimulationResultSchema, {
          method: 'POST',
          body: { orders: 30 },
        });
        const by = (t: CaseType) => result.gabarito.filter((g) => g.caseType === t).length;
        setMessage({
          tone: 'info',
          text:
            `Simulação (seed ${result.seed}): ${result.orders} pedidos enviados, com ` +
            `${by('PAYMENT_WITHOUT_ORDER')} pagamentos sem pedido, ${by('DUPLICATE_WEBHOOK')} webhooks ` +
            `duplicados e ${by('AMOUNT_MISMATCH')} valores divergentes. Agora clique em Conciliar agora.`,
        });
      } else {
        const result = await apiRequest('/reconcile', ReconciliationResultSchema, {
          method: 'POST',
        });
        const opened = Object.values(result.opened).reduce((sum, n) => sum + n, 0);
        setMessage({
          tone: 'info',
          text:
            `Conciliação: ${opened} caso(s) novo(s) aberto(s); ${result.alreadyOpen} já estavam abertos e ` +
            `${result.alreadyResolved} já tinham sido resolvidos.`,
        });
      }
      refresh();
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }

  const total = cases.data?.pagination.total ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Casos</h1>
          <p className="text-muted-foreground text-sm">
            Divergências entre loja, gateway e ERP encontradas pela conciliação.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void run('simulate')} disabled={busy !== null}>
            {busy === 'simulate' ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles aria-hidden="true" />
            )}
            Gerar falhas
          </Button>
          <Button onClick={() => void run('reconcile')} disabled={busy !== null}>
            {busy === 'reconcile' ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Scale aria-hidden="true" />
            )}
            Conciliar agora
          </Button>
        </div>
      </div>

      {message && <StatusMessage tone={message.tone}>{message.text}</StatusMessage>}

      <section
        aria-label="Casos abertos por tipo"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {CASE_TYPES.map((t) => (
          <CounterCard
            key={t}
            label={CASE_TYPE_LABEL[t]}
            hint="abertos"
            value={counts[t]}
            accent={CASE_TYPE_ACCENT[t]}
            pressed={type === t && status === 'OPEN'}
            onClick={() => filter(type === t ? 'ALL' : t, 'OPEN')}
          />
        ))}
        <CounterCard
          label="Resolvidos"
          hint="no total"
          value={resolved}
          accent="text-emerald-300"
          pressed={type === 'ALL' && status === 'RESOLVED'}
          onClick={() => filter('ALL', status === 'RESOLVED' ? 'OPEN' : 'RESOLVED')}
        />
      </section>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="filtro-tipo">Tipo</Label>
              <Select value={type} onValueChange={(v) => filter(v as TypeFilter, status)}>
                <SelectTrigger id="filtro-tipo" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  {CASE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {CASE_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="filtro-status">Status</Label>
              <Select value={status} onValueChange={(v) => filter(type, v as StatusFilter)}>
                <SelectTrigger id="filtro-status" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="OPEN">Abertos</SelectItem>
                  <SelectItem value="RESOLVED">Resolvidos</SelectItem>
                  <SelectItem value="DISMISSED">Descartados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {cases.waking && <WakingNotice />}
          {cases.error && !cases.data ? (
            <ErrorState message={cases.error} onRetry={cases.reload} />
          ) : cases.loading ? (
            <LoadingState rows={6} />
          ) : cases.data && cases.data.data.length > 0 ? (
            <>
              <CasesTable page={cases.data} />
              <nav
                aria-label="Paginação"
                className="flex items-center justify-between gap-2 text-sm"
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  <ChevronLeft aria-hidden="true" /> Anterior
                </Button>
                <span className="text-muted-foreground tabular-nums">
                  {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} de {total}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Próxima <ChevronRight aria-hidden="true" />
                </Button>
              </nav>
            </>
          ) : (
            <EmptyState title="Nenhum caso com esses filtros">
              Clique em <strong>Gerar falhas</strong> para simular pedidos com problemas e depois em{' '}
              <strong>Conciliar agora</strong> para abrir os casos.
            </EmptyState>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
