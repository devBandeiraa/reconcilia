import { z } from 'zod';

/**
 * Extrato do gateway (SIMULADO). Num gateway real viria da API de conciliação dele; aqui o
 * simulador publica o extrato e a conciliação consulta. É a única fonte das capturas cujo
 * webhook se perdeu.
 */
export const GatewayStatementEntrySchema = z.object({
  chargeId: z.string().min(1).max(64),
  eventId: z.string().min(1).max(128),
  orderReference: z.string().min(1).max(64),
  amountCents: z.number().int().nonnegative(),
  capturedAt: z.iso.datetime(),
});
export type GatewayStatementEntry = z.infer<typeof GatewayStatementEntrySchema>;

export const GatewayStatementUploadSchema = z.object({
  entries: z.array(GatewayStatementEntrySchema).min(1).max(500),
});
export type GatewayStatementUpload = z.infer<typeof GatewayStatementUploadSchema>;

export const GatewayStatementQuerySchema = z.object({
  orderReference: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
export type GatewayStatementQuery = z.infer<typeof GatewayStatementQuerySchema>;

export const GatewayStatementPageSchema = z.object({
  data: z.array(GatewayStatementEntrySchema),
  pagination: z.object({
    limit: z.number().int(),
    offset: z.number().int(),
    total: z.number().int(),
  }),
});
export type GatewayStatementPage = z.infer<typeof GatewayStatementPageSchema>;
