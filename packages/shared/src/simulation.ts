import { z } from 'zod';

/** Tipos de divergência que a conciliação abre como caso (mesmos valores do enum CaseType do banco). */
export const CASE_TYPES = [
  'PAYMENT_WITHOUT_ORDER',
  'DUPLICATE_WEBHOOK',
  'AMOUNT_MISMATCH',
] as const;
export type CaseType = (typeof CASE_TYPES)[number];

const rate = z.number().min(0).max(1);

/** Parâmetros do simulador (CLI e POST /simulate). No máximo uma falha por pedido. */
export const SimulationOptionsSchema = z
  .object({
    orders: z.number().int().min(1).max(200).default(50),
    lost: rate.default(0.1),
    duplicate: rate.default(0.15),
    mismatch: rate.default(0.1),
    seed: z.number().int().min(0).max(2_147_483_647).optional(),
  })
  .refine((o) => o.lost + o.duplicate + o.mismatch <= 1, {
    message: 'lost + duplicate + mismatch deve ser no máximo 1 (uma falha por pedido)',
    path: ['lost'],
  });
export type SimulationOptionsInput = z.input<typeof SimulationOptionsSchema>;
export type SimulationOptions = z.output<typeof SimulationOptionsSchema>;

/** Uma linha do gabarito: o caso que a conciliação DEVE abrir para o pedido. */
export const GabaritoEntrySchema = z.discriminatedUnion('caseType', [
  z.object({ caseType: z.literal('PAYMENT_WITHOUT_ORDER'), orderExternalId: z.string() }),
  z.object({
    caseType: z.literal('DUPLICATE_WEBHOOK'),
    orderExternalId: z.string(),
    copies: z.number().int().min(2).max(5),
  }),
  z.object({
    caseType: z.literal('AMOUNT_MISMATCH'),
    orderExternalId: z.string(),
    orderCents: z.number().int(),
    erpCents: z.number().int(),
  }),
]);
export type GabaritoEntry = z.infer<typeof GabaritoEntrySchema>;

export const DeliveryTotalsSchema = z.object({
  orders: z.number().int(),
  authorizations: z.number().int(),
  captures: z.number().int(),
  duplicateCopies: z.number().int(),
  erpEvents: z.number().int(),
  statementEntries: z.number().int(),
});
export type DeliveryTotals = z.infer<typeof DeliveryTotalsSchema>;

/** Resultado de uma simulação: a seed usada, o gabarito e o que foi enviado. */
export const SimulationResultSchema = z.object({
  seed: z.number().int(),
  orders: z.number().int(),
  gabarito: z.array(GabaritoEntrySchema),
  totals: DeliveryTotalsSchema,
});
export type SimulationResult = z.infer<typeof SimulationResultSchema>;
