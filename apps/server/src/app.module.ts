import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { CoreModule } from './core/core.module.js';
import type { CoreOptions } from './core/core.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { GatewayModule } from './modules/gateway/gateway.module.js';
import { LobbyModule } from './modules/lobby/lobby.module.js';
import { TableRuntimeModule } from './modules/table-runtime/table-runtime.module.js';
import { WalletModule } from './modules/wallet/wallet.module.js';

@Module({})
export class AppModule {
  static forRoot(options: CoreOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [CoreModule.forRoot(options), WalletModule, AuthModule, TableRuntimeModule, GatewayModule, LobbyModule],
    };
  }
}
