'use client';

import {
  ActionDecisionSchema,
  type CaseDetail,
  InvestigateResponseSchema,
  type Investigation,
  InvestigationSchema,
} from '@reconcilia/shared';
import { Bot, Check, Loader2, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { ErrorState, LoadingState, StatusMessage, WakingNotice } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, apiRequest } from '@/lib/api';
import { ACTION_LABEL, brl } from '@/lib/format';
import { endOperatorSession, startOperatorSession, useOperator } from '@/lib/operator';
import { useApi } from '@/lib/use-api';

const POLL_MS = 1_500;

const INVESTIGATION_LABEL: Record<Investigation['status'], string> = {
  QUEUED: 'Na fila',
  RUNNING: 'Investigando',
  DONE: 'Concluída',
  FAILED: 'Falhou',
};

const ACTION_STATUS_LABEL = {
  PENDING: 'Aguardando aprovação',
  APPROVED: 'Aprovada',
  REJECTED: 'Recusada',
  EXECUTED: 'Executada',
} as const;

function formatParam(key: string, value: unknown): string {
  if (typeof value === 'number' && key.endsWith('Cents')) return brl(value);
  return String(value);
}

const PARAM_LABEL: Record<string, string> = {
  chargeId: 'Cobrança',
  eventId: 'Evento',
  expectedCents: 'Valor esperado',
  erpCents: 'Valor no ERP',
};

function Confidence({ value }: { value: number }) {
  const percent = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Confiança do agente</span>
        <span className="tabular-nums">{percent}%</span>
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full" aria-hidden="true">
        <div className="bg-primary h-full rounded-full" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function Decision({
  investigation,
  onDecided,
}: {
  investigation: Investigation;
  onDecided: () => void;
}) {
  const nameId = useId();
  const reasonId = useId();
  const operator = useOperator();
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);

  const action = investigation.action;
  if (!action) return null;

  async function decide(kind: 'approve' | 'reject') {
    if (!action) return;
    if (!operator && !name.trim()) {
      setMessage({
        tone: 'error',
        text: 'Escolha um nome de operador antes de decidir: ele vai para a auditoria.',
      });
      return;
    }
    setBusy(kind);
    setMessage(null);
    try {
      // Quem decide é o operador do token; a api ignora qualquer nome no corpo.
      const session = operator ?? (await startOperatorSession(name.trim()));
      const decidedBy = session.operator;
      const body = kind === 'reject' && reason.trim() ? { reason: reason.trim() } : {};
      const result = await apiRequest(`/actions/${action.id}/${kind}`, ActionDecisionSchema, {
        method: 'POST',
        body,
        token: session.token,
      });
      setRejectOpen(false);
      setMessage({
        tone: 'info',
        text:
          result.action.status === 'EXECUTED'
            ? `Aprovada por ${decidedBy} e executada. O caso agora está ${result.case.status === 'RESOLVED' ? 'resolvido' : 'aberto'}.`
            : `Recusada por ${decidedBy}. O caso continua aberto.`,
      });
      onDecided();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        endOperatorSession();
        setRejectOpen(false);
        setMessage({
          tone: 'error',
          text: 'A sessão de operador expirou. Escolha o nome de novo para decidir.',
        });
      } else {
        setMessage({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">Ação sugerida</h3>
        <Badge variant="outline">{ACTION_STATUS_LABEL[action.status]}</Badge>
      </div>
      <p>{ACTION_LABEL[action.kind]}</p>
      {investigation.suggestedAction && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {Object.entries(investigation.suggestedAction.params).map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-muted-foreground">{PARAM_LABEL[key] ?? key}</dt>
              <dd className="font-mono break-all">{formatParam(key, value)}</dd>
            </div>
          ))}
        </dl>
      )}

      {action.status === 'PENDING' && (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            O agente só sugere. Nada acontece até uma pessoa aprovar.
          </p>
          {operator ? (
            <p className="text-sm">
              Decidindo como <strong className="font-medium">{operator.operator}</strong>.{' '}
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground underline underline-offset-2"
                onClick={() => {
                  setName(operator.operator);
                  endOperatorSession();
                }}
              >
                Trocar
              </button>
            </p>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor={nameId}>Nome de operador</Label>
              <Input
                id={nameId}
                value={name}
                maxLength={60}
                autoComplete="name"
                onChange={(e) => setName(e.target.value)}
                placeholder="Quem está decidindo"
                aria-describedby={`${nameId}-ajuda`}
              />
              <p id={`${nameId}-ajuda`} className="text-muted-foreground text-xs">
                Escolhido uma vez e lembrado por 24h. É uma identificação de demonstração, sem
                senha.
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void decide('approve')} disabled={busy !== null}>
              {busy === 'approve' ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              Aprovar
            </Button>
            <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={busy !== null}>
                  <X aria-hidden="true" /> Recusar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Recusar a ação sugerida</DialogTitle>
                  <DialogDescription>
                    O caso continua aberto e pode ser investigado de novo. O motivo fica na
                    auditoria.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-1.5">
                  <Label htmlFor={reasonId}>Motivo (opcional)</Label>
                  <Input
                    id={reasonId}
                    value={reason}
                    maxLength={500}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancelar</Button>
                  </DialogClose>
                  <Button
                    variant="destructive"
                    onClick={() => void decide('reject')}
                    disabled={busy !== null}
                  >
                    {busy === 'reject' && <Loader2 className="animate-spin" aria-hidden="true" />}
                    Recusar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      )}
      {message && <StatusMessage tone={message.tone}>{message.text}</StatusMessage>}
    </div>
  );
}

function InvestigationBody({
  investigation,
  onDecided,
}: {
  investigation: Investigation;
  onDecided: () => void;
}) {
  const active = investigation.status === 'QUEUED' || investigation.status === 'RUNNING';
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
        {active && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        <span>Investigação: {INVESTIGATION_LABEL[investigation.status]}</span>
      </div>

      {investigation.steps.length > 0 && (
        <div>
          <h3 className="mb-2 font-medium">Passos</h3>
          <ol className="space-y-2 text-sm">
            {investigation.steps.map((step, i) => (
              <li key={i} className="bg-muted/40 rounded-md p-2">
                <span className="text-muted-foreground font-mono text-xs">{step.tool}</span>
                <p className="text-muted-foreground mt-0.5">{step.summary}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {investigation.status === 'FAILED' && (
        <StatusMessage tone="error">
          {investigation.failureReason ?? 'A investigação falhou.'}
        </StatusMessage>
      )}

      {investigation.diagnosis && (
        <div className="space-y-2">
          <h3 className="font-medium">Diagnóstico</h3>
          <p className="text-sm leading-relaxed">{investigation.diagnosis}</p>
        </div>
      )}

      {investigation.evidence.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium">Evidências</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {investigation.evidence.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {investigation.confidence !== null && <Confidence value={investigation.confidence} />}

      <Decision investigation={investigation} onDecided={onDecided} />
    </div>
  );
}

export function AgentPanel({ detail, onChange }: { detail: CaseDetail; onChange: () => void }) {
  const [startedId, setStartedId] = useState<string>();
  const investigationId = startedId ?? detail.investigations[0]?.id;
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const investigation = useApi(
    investigationId ? `/investigations/${investigationId}` : null,
    InvestigationSchema,
    { pollMs: running ? POLL_MS : undefined },
  );
  // Ao trocar de investigação, o dado anterior não vale para a nova.
  const data = investigation.data?.id === investigationId ? investigation.data : undefined;
  const status = data?.status;

  // Polling só enquanto o agente trabalha; ao terminar, recarrega o caso (histórico).
  const wasRunning = useRef(false);
  useEffect(() => {
    const now = status === 'QUEUED' || status === 'RUNNING';
    if (wasRunning.current && !now) onChange();
    wasRunning.current = now;
    setRunning(now);
  }, [status, onChange]);

  async function start() {
    setStarting(true);
    setStartError(null);
    try {
      const result = await apiRequest(
        `/cases/${detail.case.id}/investigate`,
        InvestigateResponseSchema,
        { method: 'POST' },
      );
      setStartedId(result.investigationId);
      onChange();
    } catch (error) {
      setStartError(error instanceof Error ? error.message : String(error));
    } finally {
      setStarting(false);
    }
  }

  const canInvestigate =
    detail.case.status === 'OPEN' &&
    (!data ||
      data.status === 'FAILED' ||
      (data.status === 'DONE' && data.action?.status === 'REJECTED'));

  return (
    <Card aria-labelledby="agente-titulo">
      <CardHeader>
        <CardTitle>
          <h2 id="agente-titulo" className="flex items-center gap-2 text-base">
            <Bot className="size-4" aria-hidden="true" /> Agente de IA
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!investigationId && (
          <p className="text-muted-foreground text-sm">
            O agente consulta os três lados com ferramentas somente leitura e sugere uma correção.
            Ele nunca escreve no banco.
          </p>
        )}
        {canInvestigate && (
          <Button onClick={() => void start()} disabled={starting}>
            {starting ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Search aria-hidden="true" />
            )}
            {data ? 'Investigar de novo' : 'Investigar'}
          </Button>
        )}
        {startError && <StatusMessage tone="error">{startError}</StatusMessage>}

        {investigationId &&
          (investigation.waking ? (
            <WakingNotice />
          ) : investigation.error && !data ? (
            <ErrorState message={investigation.error} onRetry={investigation.reload} />
          ) : data ? (
            <InvestigationBody
              investigation={data}
              onDecided={() => {
                investigation.reload();
                onChange();
              }}
            />
          ) : (
            <LoadingState rows={3} />
          ))}
      </CardContent>
    </Card>
  );
}
