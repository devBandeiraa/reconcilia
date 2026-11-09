import type { CaseStatus, CaseType } from '@reconcilia/shared';
import { Ban, CircleDollarSign, Copy, EqualNot, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CASE_STATUS_LABEL, CASE_TYPE_LABEL } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Regra de cor (ADR 0013): cor só para status. O tipo de divergência é neutro, com ícone e
 * rótulo; assim a mesma cor nunca tem dois sentidos na mesma linha.
 */
export const CASE_TYPE_ICON: Record<CaseType, LucideIcon> = {
  PAYMENT_WITHOUT_ORDER: CircleDollarSign,
  DUPLICATE_WEBHOOK: Copy,
  AMOUNT_MISMATCH: EqualNot,
  CAPTURE_ON_CANCELED_ORDER: Ban,
};

export function CaseTypeLabel({ type, className }: { type: CaseType; className?: string }) {
  const Icon = CASE_TYPE_ICON[type];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
      <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
      {CASE_TYPE_LABEL[type]}
    </span>
  );
}

/** Aberto = atenção (âmbar), Resolvido = ok (verde), Descartado = cinza. Sempre com texto. */
const STATUS_STYLE: Record<CaseStatus, string> = {
  OPEN: 'border-status-attention/35 bg-status-attention/12 text-status-attention',
  RESOLVED: 'border-status-ok/35 bg-status-ok/12 text-status-ok',
  DISMISSED: 'border-status-muted/35 bg-status-muted/12 text-status-muted',
};

/**
 * Selo de status. `discreet`: quando o filtro já diz qual é o status (ex.: só abertos), a linha
 * mostra só o texto, sem selo colorido, para a cor não virar ruído.
 */
export function CaseStatusBadge({
  status,
  discreet = false,
}: {
  status: CaseStatus;
  discreet?: boolean;
}) {
  if (discreet) {
    return <span className="text-muted-foreground text-sm">{CASE_STATUS_LABEL[status]}</span>;
  }
  return (
    <Badge variant="outline" className={cn('font-normal', STATUS_STYLE[status])}>
      {CASE_STATUS_LABEL[status]}
    </Badge>
  );
}
