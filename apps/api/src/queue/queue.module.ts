import { Global, Module } from '@nestjs/common';
import { DeadLetterController } from './dead-letter.controller.js';
import { QueueService } from './queue.service.js';

@Global()
@Module({
  controllers: [DeadLetterController],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
