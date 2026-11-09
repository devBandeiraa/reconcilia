'use client';

import {
  DeadLetterPageSchema,
  HealthResponseSchema,
  type LedgerAccountName,
  LedgerBalanceSchema,
} from '@reconcilia/shared';
import { CheckCircle2, XCircle } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState, WakingNotice } from '@/components/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { brl, relativeTime } from '@/lib/format';
import { useApi } from '@/lib/use-api';

const ACCOUNT_LABEL: Record<LedgerAccountName, string> = {
  GATEWAY_RECEIVABLE: 'A receber do gateway',
  ORDER_REVENUE: 'Receita de pedidos',
  REFUNDS: 'Estornos',
  ERP_ADJUSTMENTS: 'Ajustes no ERP',
};

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card aria-labelledby={id}>
      <CardHeader>
        <CardTitle>
          <h2 id={id} className="text-base">
            {title}
          </h2>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Ledger() {
  const ledger = useApi('/ledger/balance', LedgerBalanceSchema);
  if (!ledger.data) {
    return ledger.error ? (
      <ErrorState message={ledger.error} onRetry={ledger.reload} />
    ) : (
      <LoadingState rows={5} />
    );
  }
  const { accounts, totalCents, transactions, entries } = ledger.data;
  const balanced = totalCents === 0;
  return (
    <div className="space-y-4">
      <p
        className={
          balanced
            ? 'text-status-ok flex items-center gap-2 text-sm'
            : 'text-destructive flex items-center gap-2 text-sm'
        }
      >
        {balanced ? (
          <CheckCircle2 className="size-4" aria-hidden="true" />
        ) : (
          <XCircle className="size-4" aria-hidden="true" />
        )}
        {balanced
          ? `Soma zero: ${transactions} transações e ${entries} lançamentos fecham.`
          : `A soma não fecha: sobram ${brl(totalCents)}.`}
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Conta</TableHead>
              <TableHead className="text-right">Débitos</TableHead>
              <TableHead className="text-right">Créditos</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((a) => (
              <TableRow key={a.account}>
                <TableCell>
                  {ACCOUNT_LABEL[a.account]}
                  <span className="text-muted-foreground block font-mono text-xs">{a.account}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{brl(a.debitCents)}</TableCell>
                <TableCell className="text-right tabular-nums">{brl(a.creditCents)}</TableCell>
                <TableCell className="text-right tabular-nums">{brl(a.balanceCents)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3}>Total</TableCell>
              <TableCell className="text-right tabular-nums">{brl(totalCents)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}

function DeadLetters() {
  const dlq = useApi('/admin/dlq', DeadLetterPageSchema);
  if (!dlq.data) {
    return dlq.error ? (
      <ErrorState message={dlq.error} onRetry={dlq.reload} />
    ) : (
      <LoadingState rows={3} />
    );
  }
  if (dlq.data.data.length === 0) {
    return (
      <EmptyState title="Fila de mortos vazia">
        Nenhum evento esgotou as tentativas do worker.
      </EmptyState>
    );
  }
  return (
    <ul className="space-y-2 text-sm">
      {dlq.data.data.map((job) => (
        <li key={job.jobId} className="rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono">{job.orderExternalId}</span>
            <span className="text-muted-foreground text-xs">
              {job.retryCount} tentativas · {relativeTime(job.createdOn)}
            </span>
          </div>
          <p className="text-muted-foreground mt-1 font-mono text-xs break-all">{job.eventId}</p>
          {job.error && <p className="text-destructive mt-1 text-xs">{job.error}</p>}
        </li>
      ))}
    </ul>
  );
}

export function HealthView() {
  const health = useApi('/health', HealthResponseSchema);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Saúde</h1>
        <p className="text-muted-foreground text-sm">
          O ledger em partidas dobradas, a fila de mortos e a api.
        </p>
      </div>
      {health.waking && <WakingNotice />}

      <Section id="api-titulo" title="API" description="Resposta do GET /health.">
        {health.data ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {Object.entries(health.data).map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-muted-foreground">{key}</dt>
                <dd className="font-mono">{String(value)}</dd>
              </div>
            ))}
          </dl>
        ) : health.error ? (
          <ErrorState message={health.error} onRetry={health.reload} />
        ) : (
          <LoadingState rows={2} />
        )}
      </Section>

      <Section
        id="ledger-titulo"
        title="Ledger"
        description="Saldo por conta. Todo movimento de dinheiro tem débito e crédito, então o total é sempre zero."
      >
        <Ledger />
      </Section>

      <Section
        id="dlq-titulo"
        title="Fila de mortos (DLQ)"
        description="Eventos do gateway que falharam em todas as tentativas do worker."
      >
        <DeadLetters />
      </Section>
    </div>
  );
}
