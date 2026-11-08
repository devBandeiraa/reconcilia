import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type Investigation,
  type InvestigationStep,
  SuggestedActionSchema,
} from '@reconcilia/shared';
import { InjectPinoLogger, type PinoLogger } from 'nestjs-pino';
import { fromPrisma } from 'pg-boss';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import {
  ActionStatus,
  CaseStatus,
  InvestigationStatus,
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { INVESTIGATIONS_QUEUE, type InvestigationJob } from '../queue/queue.constants.js';
import { QueueService } from '../queue/queue.service.js';
import { type AgentOutcome, AgentRunner } from './agent.runner.js';
import { LLM_CLIENT, type LlmClient } from './llm/llm-client.js';

const ACTIVE = [InvestigationStatus.QUEUED, InvestigationStatus.RUNNING];

export interface StartResult {
  investigationId: string;
  status: InvestigationStatus;
  /** false quando já havia uma investigação ativa para o caso (ela é devolvida). */
  created: boolean;
}

@Injectable()
export class InvestigationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly runner: AgentRunner,
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
    @Inject(ENV) private readonly env: Env,
    @InjectPinoLogger(InvestigationsService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Cria a investigação QUEUED e enfileira na mesma transação. Uma investigação ativa por caso
   * é garantida pelo índice único parcial; se já houver uma, ela é devolvida.
   */
  async start(caseId: string): Promise<StartResult> {
    const found = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { status: true },
    });
    if (!found) throw new NotFoundException(`Caso ${caseId} não encontrado`);
    if (found.status !== CaseStatus.OPEN) {
      throw new ConflictException(
        `Só casos OPEN podem ser investigados (este está ${found.status})`,
      );
    }

    const active = async (): Promise<StartResult | null> => {
      const row = await this.prisma.investigation.findFirst({
        where: { caseId, status: { in: ACTIVE } },
        select: { id: true, status: true },
      });
      return row ? { investigationId: row.id, status: row.status, created: false } : null;
    };

    const existing = await active();
    if (existing) return existing;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const investigation = await tx.investigation.create({ data: { caseId } });
        const job: InvestigationJob = { investigationId: investigation.id };
        await this.queue.boss.send(INVESTIGATIONS_QUEUE, job, {
          retryLimit: 0,
          db: fromPrisma(tx),
        });
        return { investigationId: investigation.id, status: investigation.status, created: true };
      });
    } catch (error) {
      // Duas chamadas ao mesmo tempo: o índice parcial barrou a segunda.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await active();
        if (winner) return winner;
      }
      throw error;
    }
  }

  /** Roda o agente e grava o resultado. Nunca lança: falha vira FAILED com o motivo. */
  async execute(investigationId: string): Promise<void> {
    const claimed = await this.prisma.investigation.updateMany({
      where: { id: investigationId, status: InvestigationStatus.QUEUED },
      data: { status: InvestigationStatus.RUNNING },
    });
    if (claimed.count === 0) return;

    const investigation = await this.prisma.investigation.findUniqueOrThrow({
      where: { id: investigationId },
      include: { case: { include: { order: true } } },
    });
    const log = {
      investigationId,
      caseId: investigation.caseId,
      orderExternalId: investigation.case.order.externalId,
      llm: this.llm.name,
    };

    let outcome: AgentOutcome;
    try {
      outcome = await this.runner.run({
        caseId: investigation.caseId,
        caseType: investigation.case.type,
        detectedAt: investigation.case.detectedAt,
        orderExternalId: investigation.case.order.externalId,
        storeTimezone: this.env.STORE_TIMEZONE,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcome = {
        status: 'FAILED',
        failureReason: `Erro inesperado: ${message}`,
        steps: [],
        rounds: 0,
      };
    }

    const steps = outcome.steps as unknown as Prisma.InputJsonValue;
    if (outcome.status === 'DONE') {
      const { diagnosis, evidence, suggestedAction, confidence } = outcome.diagnosis;
      await this.prisma.$transaction([
        this.prisma.investigation.update({
          where: { id: investigationId },
          data: {
            status: InvestigationStatus.DONE,
            steps,
            diagnosis,
            evidence,
            suggestedAction,
            confidence,
          },
        }),
        this.prisma.action.create({
          data: {
            investigationId,
            kind: suggestedAction.kind,
            params: suggestedAction.params,
            status: ActionStatus.PENDING,
          },
        }),
      ]);
      this.logger.info(
        { ...log, rounds: outcome.rounds, action: suggestedAction.kind },
        'investigação concluída',
      );
    } else {
      await this.prisma.investigation.update({
        where: { id: investigationId },
        data: { status: InvestigationStatus.FAILED, steps, failureReason: outcome.failureReason },
      });
      this.logger.warn(
        { ...log, rounds: outcome.rounds, reason: outcome.failureReason },
        'investigação falhou',
      );
    }
  }

  async get(id: string): Promise<Investigation> {
    const row = await this.prisma.investigation.findUnique({
      where: { id },
      include: { actions: { orderBy: { createdAt: 'asc' }, take: 1 } },
    });
    if (!row) throw new NotFoundException(`Investigação ${id} não encontrada`);

    const action = row.actions[0];
    const suggested = SuggestedActionSchema.safeParse(row.suggestedAction);
    return {
      id: row.id,
      caseId: row.caseId,
      status: row.status,
      steps: row.steps as unknown as InvestigationStep[],
      diagnosis: row.diagnosis,
      evidence: row.evidence as string[],
      suggestedAction: suggested.success ? suggested.data : null,
      confidence: row.confidence,
      failureReason: row.failureReason,
      createdAt: row.createdAt.toISOString(),
      action: action ? { id: action.id, kind: action.kind, status: action.status } : null,
    };
  }
}
