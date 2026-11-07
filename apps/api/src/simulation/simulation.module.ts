import { Module } from '@nestjs/common';
import { GatewayStatementController } from './gateway-statement.controller.js';
import { GatewayStatementService } from './gateway-statement.service.js';

/** Sistemas externos simulados (extrato do gateway) e o disparo do simulador. */
@Module({
  controllers: [GatewayStatementController],
  providers: [GatewayStatementService],
})
export class SimulationModule {}
