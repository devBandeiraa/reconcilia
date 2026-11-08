import { z } from 'zod';
import { ACTION_KINDS, ACTION_STATUSES } from './agent.js';
import { CASE_STATUSES } from './cases.js';

const isoDateTime = z.iso.datetime();

/** Quem decide. Até haver login, a pessoa se identifica na requisição. */
export const DecisionRequestSchema = z.strictObject({
  decidedBy: z.string().trim().min(1).max(100),
});
export type DecisionRequest = z.infer<typeof DecisionRequestSchema>;

export const RejectRequestSchema = z.strictObject({
  decidedBy: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(1).max(500).optional(),
});
export type RejectRequest = z.infer<typeof RejectRequestSchema>;

export const AUDIT_EVENTS = ['APPROVED', 'REJECTED', 'EXECUTED', 'EXECUTION_FAILED'] as const;
export type AuditEventName = (typeof AUDIT_EVENTS)[number];

/** Uma linha da trilha de auditoria (append-only no banco). */
export const AuditEntrySchema = z.object({
  event: z.enum(AUDIT_EVENTS),
  actor: z.string(),
  at: isoDateTime,
  details: z.record(z.string(), z.unknown()),
});
export type AuditEntryView = z.infer<typeof AuditEntrySchema>;

export const ActionViewSchema = z.object({
  id: z.uuid(),
  investigationId: z.uuid(),
  caseId: z.uuid(),
  kind: z.enum(ACTION_KINDS),
  params: z.record(z.string(), z.unknown()),
  status: z.enum(ACTION_STATUSES),
  decidedBy: z.string().nullable(),
  decidedAt: isoDateTime.nullable(),
  executedAt: isoDateTime.nullable(),
  rejectionReason: z.string().nullable(),
  /** O que a execução fez (ou já encontrou feito). */
  executionResult: z.record(z.string(), z.unknown()).nullable(),
  audit: z.array(AuditEntrySchema),
});
export type ActionView = z.infer<typeof ActionViewSchema>;

/** Resposta de aprovar ou recusar: a ação e o estado do caso depois da decisão. */
export const ActionDecisionSchema = z.object({
  action: ActionViewSchema,
  case: z.object({ id: z.uuid(), status: z.enum(CASE_STATUSES) }),
});
export type ActionDecision = z.infer<typeof ActionDecisionSchema>;
