import { z } from 'zod';

// Variável pública: o Next a embute no bundle no build, então ela é lida pelo nome literal.
const EnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url().default('http://localhost:3001'),
});

const result = EnvSchema.safeParse({ NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL });
if (!result.success) {
  throw new Error(`Variáveis de ambiente inválidas:\n${z.prettifyError(result.error)}`);
}

export const env = {
  /** URL da api, chamada direto do navegador (a api libera esta origem no CORS). */
  apiUrl: result.data.NEXT_PUBLIC_API_URL.replace(/\/$/, ''),
};
