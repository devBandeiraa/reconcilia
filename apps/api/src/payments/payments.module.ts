import { Module } from '@nestjs/common';
import { PaymentEventProcessor } from './payment-event.processor.js';
import { PaymentEventsWorker } from './payment-events.worker.js';

@Module({
  providers: [PaymentEventProcessor, PaymentEventsWorker],
})
export class PaymentsModule {}
