var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Controller, Get, Inject, Module } from '@nestjs/common';
import { TableRuntime } from '../table-runtime/table-runtime.service.js';
import { TableRuntimeModule } from '../table-runtime/table-runtime.module.js';
let LobbyController = class LobbyController {
    runtime;
    constructor(runtime) {
        this.runtime = runtime;
    }
    list() {
        return this.runtime.list();
    }
};
__decorate([
    Get()
], LobbyController.prototype, "list", null);
LobbyController = __decorate([
    Controller('tables'),
    __param(0, Inject(TableRuntime))
], LobbyController);
export { LobbyController };
let LobbyModule = class LobbyModule {
};
LobbyModule = __decorate([
    Module({
        imports: [TableRuntimeModule],
        controllers: [LobbyController],
    })
], LobbyModule);
export { LobbyModule };
//# sourceMappingURL=lobby.module.js.map