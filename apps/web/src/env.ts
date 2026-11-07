import { z } from 'zod';

// Só variáveis de servidor por enquanto: a página busca a api no servidor, sem CORS.
const EnvSchema = z.object({
  API_URL: z.url().default('http://localhost:3001'),
});

const result = EnvSchema.safeParse(process.env);
if (!result.success) {
  throw new Error(`Variáveis de ambiente inválidas:\n${z.prettifyError(result.error)}`);
}

export const env = result.data;
