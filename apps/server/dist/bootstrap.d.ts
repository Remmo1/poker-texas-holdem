import 'reflect-metadata';
import type { INestApplication, LogLevel } from '@nestjs/common';
import type { CoreOptions } from './core/core.module.js';
export declare function createApp(options: CoreOptions & {
    logger?: LogLevel[] | false;
}): Promise<INestApplication>;
