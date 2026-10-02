import type { TableSummary } from '@holdem/shared';
import { TableRuntime } from '../table-runtime/table-runtime.service.js';
export declare class LobbyController {
    private readonly runtime;
    constructor(runtime: TableRuntime);
    list(): TableSummary[];
}
export declare class LobbyModule {
}
