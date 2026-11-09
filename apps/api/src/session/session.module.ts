import { Module } from '@nestjs/common';
import { OperatorGuard } from './operator.guard.js';
import { SessionController } from './session.controller.js';

@Module({
  controllers: [SessionController],
  providers: [OperatorGuard],
  exports: [OperatorGuard],
})
export class SessionModule {}
