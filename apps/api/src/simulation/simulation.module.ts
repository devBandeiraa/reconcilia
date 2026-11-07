import { Module } from '@nestjs/common';
import { GatewayStatementController } from './gateway-statement.controller.js';
import { GatewayStatementService } from './gateway-statement.service.js';
import { SimulationController } from './simulation.controller.js';
import { SimulationService } from './simulation.service.js';

/** Sistemas externos simulados (extrato do gateway) e o disparo do simulador. */
@Module({
  controllers: [GatewayStatementController, SimulationController],
  providers: [GatewayStatementService, SimulationService],
})
export class SimulationModule {}
