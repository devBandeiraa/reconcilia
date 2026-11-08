import { Module } from '@nestjs/common';
import { CasesController } from './cases.controller.js';
import { CasesService } from './cases.service.js';
import {
  GATEWAY_STATEMENT_SOURCE,
  SimulatedGatewayStatementSource,
} from './gateway-statement.source.js';
import { ReconciliationController } from './reconciliation.controller.js';
import { ReconciliationScheduler } from './reconciliation.scheduler.js';
import { ReconciliationService } from './reconciliation.service.js';

@Module({
  controllers: [ReconciliationController, CasesController],
  providers: [
    { provide: GATEWAY_STATEMENT_SOURCE, useClass: SimulatedGatewayStatementSource },
    ReconciliationService,
    CasesService,
    ReconciliationScheduler,
  ],
  exports: [ReconciliationService, GATEWAY_STATEMENT_SOURCE],
})
export class ReconciliationModule {}
