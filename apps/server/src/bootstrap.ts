import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication, LogLevel } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module.js';
import type { CoreOptions } from './core/core.module.js';
import { migrate } from './infra/db/migrate.js';

export async function createApp(options: CoreOptions & { logger?: LogLevel[] | false }): Promise<INestApplication> {
  await migrate(options.db);
  const app = await NestFactory.create(AppModule.forRoot(options), { logger: options.logger ?? ['log', 'warn', 'error'] });
  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableShutdownHooks();
  return app;
}
