import type { CaseStatus, CaseType } from '@reconcilia/shared';
import { Badge } from '@/components/ui/badge';
import { CASE_STATUS_LABEL, CASE_TYPE_LABEL } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Cor por tipo, sempre com o texto junto (a cor sozinha não carrega informação). */
const TYPE_STYLE: Record<CaseType, string> = {
  PAYMENT_WITHOUT_ORDER: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  DUPLICATE_WEBHOOK: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  AMOUNT_MISMATCH: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300',
};

const STATUS_STYLE: Record<CaseStatus, string> = {
  OPEN: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
  RESOLVED: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  DISMISSED: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300',
};

export function CaseTypeBadge({ type }: { type: CaseType }) {
  return (
    <Badge variant="outline" className={cn('font-normal', TYPE_STYLE[type])}>
      {CASE_TYPE_LABEL[type]}
    </Badge>
  );
}

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  return (
    <Badge variant="outline" className={cn('font-normal', STATUS_STYLE[status])}>
      {CASE_STATUS_LABEL[status]}
    </Badge>
  );
}

export const CASE_TYPE_ACCENT: Record<CaseType, string> = {
  PAYMENT_WITHOUT_ORDER: 'text-sky-300',
  DUPLICATE_WEBHOOK: 'text-amber-300',
  AMOUNT_MISMATCH: 'text-fuchsia-300',
};
