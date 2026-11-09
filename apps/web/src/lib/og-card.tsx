import { ImageResponse } from 'next/og';

/** Prévia de link (LinkedIn, WhatsApp, X): 1200×630, gerada pelo Next na rota da imagem. */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT =
  'Reconcilia: a IA sugere, uma pessoa aprova. Loja, gateway e ERP conciliados.';

const COLORS = {
  background: '#0c1014',
  brand: '#3fb950',
  foreground: '#e8edf2',
  muted: '#98a2ad',
  border: '#2b333d',
};

export function renderOgCard(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        background: COLORS.background,
        color: COLORS.foreground,
        borderBottom: `12px solid ${COLORS.brand}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <svg width="88" height="88" viewBox="0 0 32 32">
          <g
            fill="none"
            stroke={COLORS.brand}
            strokeWidth={3.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 11.5H18" />
            <path d="M5 19.5H12L15.5 23L26 8" />
          </g>
        </svg>
        <span style={{ fontSize: 64, letterSpacing: -1.5 }}>Reconcilia</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: 80,
            letterSpacing: -2,
            lineHeight: 1.08,
          }}
        >
          <span>A IA sugere.</span>
          <span>Uma pessoa aprova.</span>
        </div>
        <span style={{ fontSize: 36, color: COLORS.muted }}>loja · gateway · ERP</span>
      </div>
    </div>,
    OG_SIZE,
  );
}
