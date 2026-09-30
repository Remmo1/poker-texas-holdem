import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { TicketService } from './ticket.service.js';

@Module({
  imports: [WalletModule],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, TicketService],
  exports: [AuthService, TicketService],
})
export class AuthModule {}
