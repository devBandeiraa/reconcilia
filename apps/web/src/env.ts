import { z } from 'zod';

/**
 * Na Vercel (VERCEL=1 no build), a URL da api é obrigatória e precisa ser https: sem ela, o
 * bundle sairia apontando para localhost e a demo quebraria calada no navegador de quem abre.
 * Localmente, o padrão é a api do `pnpm dev`.
 */
const onVercel = Boolean(process.env.VERCEL);

// Variável pública: o Next a embute no bundle no build, então ela é lida pelo nome literal.
const EnvSchema = z.object({
  NEXT_PUBLIC_API_URL: onVercel
    ? z.url({ protocol: /^https$/, error: 'na Vercel, use a URL https da api no Render' })
    : z.url().default('http://localhost:3001'),
});

const result = EnvSchema.safeParse({ NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL });
if (!result.success) {
  throw new Error(`Variáveis de ambiente inválidas:\n${z.prettifyError(result.error)}`);
}

export const env = {
  /** URL da api, chamada direto do navegador (a api libera esta origem no CORS). */
  apiUrl: result.data.NEXT_PUBLIC_API_URL.replace(/\/$/, ''),
};
