import { AlertTriangle, Coffee, Inbox, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** Carregando: blocos no lugar do conteúdo. */
export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

/** A api demorou mais de 3s: no plano gratuito ela dorme e leva até um minuto para acordar. */
export function WakingNotice() {
  return (
    <Alert role="status" aria-live="polite">
      <Coffee aria-hidden="true" />
      <AlertTitle>Acordando o servidor…</AlertTitle>
      <AlertDescription>
        A api roda no plano gratuito e dorme depois de 15 minutos sem uso. A primeira resposta pode
        levar até um minuto; a tela continua tentando sozinha.
      </AlertDescription>
    </Alert>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive" role="alert">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>Não deu para carregar</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>{message}</span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw aria-hidden="true" /> Tentar de novo
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center">
      <Inbox className="text-muted-foreground size-8" aria-hidden="true" />
      <p className="font-medium">{title}</p>
      {children && <p className="text-muted-foreground max-w-md text-sm">{children}</p>}
    </div>
  );
}

/** Mensagem do resultado de uma ação, lida pelo leitor de tela (aria-live). */
export function StatusMessage({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'error';
}) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={
        tone === 'error'
          ? 'border-destructive/40 bg-destructive/10 text-destructive-foreground rounded-md border px-3 py-2 text-sm'
          : 'bg-muted rounded-md px-3 py-2 text-sm'
      }
    >
      {children}
    </p>
  );
}
