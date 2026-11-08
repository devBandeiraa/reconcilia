import { Global, Module } from '@nestjs/common';
import { LedgerController } from './ledger.controller.js';
import { LEDGER } from './ledger.port.js';
import { LedgerService } from './ledger.service.js';

@Global()
@Module({
  controllers: [LedgerController],
  providers: [LedgerService, { provide: LEDGER, useExisting: LedgerService }],
  exports: [LedgerService, LEDGER],
})
export class LedgerModule {}
