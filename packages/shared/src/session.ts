import { z } from 'zod';

/**
 * Sessão de demonstração: a pessoa escolhe um nome de operador e recebe um token assinado (HMAC,
 * 24h). Quem aprova ou recusa passa a ser quem está no token, não um nome digitado no corpo.
 * É identificação de demo, não autenticação: não há cadastro nem senha.
 */
export const SessionRequestSchema = z.strictObject({
  operator: z.string().trim().min(1).max(60),
});
export type SessionRequest = z.infer<typeof SessionRequestSchema>;

export const SessionResponseSchema = z.object({
  /** Vai no header `Authorization: Bearer <token>` das decisões. */
  token: z.string(),
  operator: z.string(),
  expiresAt: z.iso.datetime(),
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

/** Validade do token de operador. */
export const SESSION_TTL_SECONDS = 24 * 60 * 60;

/** Segredo padrão SÓ para desenvolvimento local. A api recusa subir com ele em produção. */
export const DEV_SESSION_SECRET = 'dev-only-session-secret-troque-em-producao';
