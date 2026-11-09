'use client';

import { type CaseDetail, CaseDetailSchema, type TimelineItem } from '@reconcilia/shared';
import { ArrowLeft, Copy } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { CaseStatusBadge, CaseTypeLabel } from '@/components/badges';
import { ErrorState, LoadingState, WakingNotice } from '@/components/states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { brl, dateTime, EVENT_LABEL, SOURCE_LABEL } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';
import { AgentPanel } from './agent-panel';

const ORDER_STATUS_LABEL: Record<CaseDetail['order']['status'], string> = {
  PENDING: 'Pendente',
  PAID: 'Pago',
  CANCELED: 'Cancelado',
};

const HISTORY_LABEL: Record<CaseDetail['history'][number]['kind'], string> = {
  DETECTED: 'Detectado',
  INVESTIGATION: 'Investigação',
  APPROVED: 'Aprovado',
  REJECTED: 'Recusado',
  EXECUTED: 'Executado',
  EXECUTION_FAILED: 'Falha na execução',
  RESOLVED: 'Resolvido',
  DISMISSED: 'Descartado',
};

function Time({ iso, timeZone }: { iso: string; timeZone: string }) {
  return (
    <time dateTime={iso} className="tabular-nums">
      {dateTime(iso, timeZone)}
    </time>
  );
}

function DuplicateMark({ item }: { item: TimelineItem }) {
  if (!item.duplicate) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded border border-status-attention/35 bg-status-attention/12 px-1.5 text-xs text-status-attention">
      <Copy className="size-3" aria-hidden="true" />
      duplicado ×{item.receivedCount ?? 2}
    </span>
  );
}

function EventList({ items, timeZone }: { items: TimelineItem[]; timeZone: string }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">Nenhum evento deste lado.</p>;
  }
  return (
    <ul className="space-y-2 text-sm">
      {items.map((item, i) => (
        <li
          key={`${item.eventId ?? item.type}-${i}`}
          className={cn(
            'rounded-md border p-2',
            item.duplicate && 'border-status-attention/35 bg-status-attention/5',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{EVENT_LABEL[item.type] ?? item.type}</span>
            <span className="tabular-nums">{brl(item.amountCents)}</span>
          </div>
          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
            <Time iso={item.at} timeZone={timeZone} />
            {item.source === 'GATEWAY_STATEMENT' && <span>extrato</span>}
            <DuplicateMark item={item} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Side({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>
          <h2 className="text-base">{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function Sides({ detail, timeZone }: { detail: CaseDetail; timeZone: string }) {
  const { order, timeline } = detail;
  const gateway = timeline.filter(
    (t) => t.source === 'GATEWAY' || t.source === 'GATEWAY_STATEMENT',
  );
  const erp = timeline.filter((t) => t.source === 'ERP');
  return (
    <section aria-label="Os três lados" className="grid gap-4 lg:grid-cols-3">
      <Side title="Loja">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Pedido</dt>
          <dd className="font-mono">{order.externalId}</dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd>{ORDER_STATUS_LABEL[order.status]}</dd>
          <dt className="text-muted-foreground">Total</dt>
          <dd className="tabular-nums">{brl(order.totalCents)}</dd>
          <dt className="text-muted-foreground">Parcelas</dt>
          <dd className="tabular-nums">{order.installments}x</dd>
          <dt className="text-muted-foreground">Criado</dt>
          <dd>
            <Time iso={order.createdAt} timeZone={timeZone} />
          </dd>
          {order.canceledAt && (
            <>
              <dt className="text-muted-foreground">Cancelado</dt>
              <dd>
                <Time iso={order.canceledAt} timeZone={timeZone} />
              </dd>
            </>
          )}
        </dl>
      </Side>
      <Side title="Gateway">
        <EventList items={gateway} timeZone={timeZone} />
      </Side>
      <Side title="ERP">
        <EventList items={erp} timeZone={timeZone} />
      </Side>
    </section>
  );
}

function Timeline({ detail, timeZone }: { detail: CaseDetail; timeZone: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-base">Linha do tempo</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="border-border relative space-y-4 border-l pl-5">
          {detail.timeline.map((item, i) => (
            <li key={`${item.eventId ?? item.type}-${i}`} className="relative">
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2',
                  item.duplicate
                    ? 'border-status-attention bg-status-attention'
                    : 'border-muted-foreground bg-background',
                )}
              />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <Time iso={item.at} timeZone={timeZone} />
                <span className="text-muted-foreground">{SOURCE_LABEL[item.source]}</span>
                <span className="font-medium">{EVENT_LABEL[item.type] ?? item.type}</span>
                <span className="tabular-nums">{brl(item.amountCents)}</span>
                <DuplicateMark item={item} />
              </div>
              {item.eventId && (
                <p className="text-muted-foreground mt-0.5 font-mono text-xs break-all">
                  {item.eventId}
                </p>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function History({ detail, timeZone }: { detail: CaseDetail; timeZone: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-base">Histórico</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3 text-sm">
          {detail.history.map((item, i) => (
            <li key={`${item.kind}-${i}`}>
              <div className="flex flex-wrap items-center gap-x-3">
                <span className="font-medium">{HISTORY_LABEL[item.kind]}</span>
                <span className="text-muted-foreground text-xs">
                  <Time iso={item.at} timeZone={timeZone} />
                </span>
              </div>
              <p className="text-muted-foreground">{item.description}</p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function ZoneToggle({
  storeTimezone,
  value,
  onChange,
}: {
  storeTimezone: string;
  value: string;
  onChange: (zone: string) => void;
}) {
  const options = [
    { zone: 'UTC', label: 'UTC' },
    { zone: storeTimezone, label: `Fuso da loja (${storeTimezone})` },
  ];
  return (
    <div
      role="group"
      aria-label="Fuso dos horários"
      className="inline-flex rounded-md border p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.zone}
          type="button"
          aria-pressed={value === o.zone}
          onClick={() => onChange(o.zone)}
          className={cn(
            'focus-visible:ring-ring rounded px-2.5 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none',
            value === o.zone
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function CaseDetailView({ id }: { id: string }) {
  const detail = useApi(`/cases/${id}`, CaseDetailSchema);
  const [zone, setZone] = useState<string | null>(null);

  const back = (
    <Link
      href="/casos"
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
    >
      <ArrowLeft className="size-4" aria-hidden="true" /> Casos
    </Link>
  );

  if (!detail.data) {
    return (
      <div className="space-y-6">
        {back}
        {detail.waking && <WakingNotice />}
        {detail.error ? (
          <ErrorState message={detail.error} onRetry={detail.reload} />
        ) : (
          <LoadingState rows={8} />
        )}
      </div>
    );
  }

  const data = detail.data;
  const timeZone = zone ?? data.storeTimezone;

  return (
    <div className="space-y-6">
      {back}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            {data.case.orderExternalId}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <CaseTypeLabel type={data.case.type} />
            <CaseStatusBadge status={data.case.status} />
            <span className="text-muted-foreground text-sm tabular-nums">
              {brl(data.case.amountCents)}
            </span>
          </div>
        </div>
        <ZoneToggle storeTimezone={data.storeTimezone} value={timeZone} onChange={setZone} />
      </header>

      <Sides detail={data} timeZone={timeZone} />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Timeline detail={data} timeZone={timeZone} />
          <History detail={data} timeZone={timeZone} />
        </div>
        <AgentPanel detail={data} onChange={detail.reload} />
      </div>
    </div>
  );
}
