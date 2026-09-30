import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TableRuntimeModule } from '../table-runtime/table-runtime.module.js';
import { ConnectionHub } from './connection-hub.js';
import { TableGateway } from './table.gateway.js';

@Module({
  imports: [AuthModule, TableRuntimeModule],
  providers: [ConnectionHub, TableGateway],
})
export class GatewayModule {}
