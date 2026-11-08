import { z } from 'zod';

/** Ações que o agente pode sugerir (mesmos valores do enum ActionKind do banco). */
export const ACTION_KINDS = [
  'REPROCESS_WEBHOOK',
  'MARK_ORDER_PAID',
  'FLAG_ERP_DIVERGENCE',
  'IGNORE_DUPLICATE',
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const ACTION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'EXECUTED'] as const;
export const INVESTIGATION_STATUSES = ['QUEUED', 'RUNNING', 'DONE', 'FAILED'] as const;

const eventId = z.string().min(1).max(128);
const cents = z.number().int().nonnegative();

/**
 * Ação sugerida, com os parâmetros de cada tipo. Nunca tem orderId: o pedido vem do caso. Os
 * ids citados são conferidos contra os dados do pedido antes de a ação ser aceita.
 */
export const SuggestedActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('MARK_ORDER_PAID'),
    params: z.strictObject({ chargeId: z.string().min(1).max(64) }),
  }),
  z.object({
    kind: z.literal('REPROCESS_WEBHOOK'),
    params: z.strictObject({ eventId }),
  }),
  z.object({
    kind: z.literal('IGNORE_DUPLICATE'),
    params: z.strictObject({ eventId }),
  }),
  z.object({
    kind: z.literal('FLAG_ERP_DIVERGENCE'),
    params: z.strictObject({ expectedCents: cents, erpCents: cents }),
  }),
]);
export type SuggestedAction = z.infer<typeof SuggestedActionSchema>;

/** Saída final do agente (ferramenta submitDiagnosis). */
export const DiagnosisSchema = z.strictObject({
  diagnosis: z.string().min(10).max(2000),
  evidence: z.array(z.string().min(1).max(500)).min(1).max(10),
  suggestedAction: SuggestedActionSchema,
  confidence: z.number().min(0).max(1),
});
export type Diagnosis = z.infer<typeof DiagnosisSchema>;

/** Um passo da investigação: qual ferramenta, com quais argumentos e o resumo do retorno. */
export const InvestigationStepSchema = z.object({
  round: z.number().int().min(1),
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
  summary: z.string(),
  at: z.iso.datetime(),
});
export type InvestigationStep = z.infer<typeof InvestigationStepSchema>;

export const InvestigationSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  status: z.enum(INVESTIGATION_STATUSES),
  steps: z.array(InvestigationStepSchema),
  diagnosis: z.string().nullable(),
  evidence: z.array(z.string()),
  suggestedAction: SuggestedActionSchema.nullable(),
  confidence: z.number().nullable(),
  failureReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  /** A ação criada a partir do diagnóstico, aguardando aprovação humana. */
  action: z
    .object({ id: z.uuid(), kind: z.enum(ACTION_KINDS), status: z.enum(ACTION_STATUSES) })
    .nullable(),
});
export type Investigation = z.infer<typeof InvestigationSchema>;

/** Resposta do POST /cases/:id/investigate. */
export const InvestigateResponseSchema = z.object({
  investigationId: z.uuid(),
  status: z.enum(INVESTIGATION_STATUSES),
});
export type InvestigateResponse = z.infer<typeof InvestigateResponseSchema>;
