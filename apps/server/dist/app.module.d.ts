import type { DynamicModule } from '@nestjs/common';
import type { CoreOptions } from './core/core.module.js';
export declare class AppModule {
    static forRoot(options: CoreOptions): DynamicModule;
}
