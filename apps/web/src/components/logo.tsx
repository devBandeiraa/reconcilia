import { cn } from '@/lib/utils';

/**
 * Símbolo do Reconcilia: um "=" cujo traço de baixo vira um ✓. "Bateu" vira "conferido".
 * O traço usa a cor da marca (--primary), então acompanha o tema.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('text-primary size-6 shrink-0', className)}
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 11.5H18" />
        <path d="M5 19.5H12L15.5 23L26 8" />
      </g>
    </svg>
  );
}

/** Símbolo e palavra, para o cabeçalho. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className="font-semibold tracking-tight">Reconcilia</span>
    </span>
  );
}
