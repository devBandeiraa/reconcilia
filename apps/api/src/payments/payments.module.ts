import { Module } from '@nestjs/common';
import { LEDGER, NoopLedger } from '../ledger/ledger.port.js';
import { PaymentEventProcessor } from './payment-event.processor.js';
import { PaymentEventsWorker } from './payment-events.worker.js';

@Module({
  providers: [
    { provide: LEDGER, useClass: NoopLedger },
    PaymentEventProcessor,
    PaymentEventsWorker,
  ],
})
export class PaymentsModule {}
