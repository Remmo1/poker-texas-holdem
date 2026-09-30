import { Controller, Get, Inject, Module } from '@nestjs/common';
import type { TableSummary } from '@holdem/shared';
import { TableRuntime } from '../table-runtime/table-runtime.service.js';
import { TableRuntimeModule } from '../table-runtime/table-runtime.module.js';

@Controller('tables')
export class LobbyController {
  constructor(@Inject(TableRuntime) private readonly runtime: TableRuntime) {}

  @Get()
  list(): TableSummary[] {
    return this.runtime.list();
  }
}

@Module({
  imports: [TableRuntimeModule],
  controllers: [LobbyController],
})
export class LobbyModule {}
