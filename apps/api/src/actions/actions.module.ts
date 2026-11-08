import { Module } from '@nestjs/common';
import { ReconciliationModule } from '../reconciliation/reconciliation.module.js';
import { ActionsController } from './actions.controller.js';
import { ActionsService } from './actions.service.js';
import { ERP_ADJUSTMENT_SINK, SimulatedErpAdjustmentSink } from './erp-adjustment.sink.js';

@Module({
  imports: [ReconciliationModule],
  controllers: [ActionsController],
  providers: [
    { provide: ERP_ADJUSTMENT_SINK, useClass: SimulatedErpAdjustmentSink },
    ActionsService,
  ],
})
export class ActionsModule {}
