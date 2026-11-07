import { z } from 'zod';

/** Resposta do GET /health da api. Usada pela api (validação) e pela web (consumo). */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string().min(1),
  version: z.string().min(1),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
