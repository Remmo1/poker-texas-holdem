var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var AppModule_1;
import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { GatewayModule } from './modules/gateway/gateway.module.js';
import { LobbyModule } from './modules/lobby/lobby.module.js';
import { TableRuntimeModule } from './modules/table-runtime/table-runtime.module.js';
import { WalletModule } from './modules/wallet/wallet.module.js';
let AppModule = AppModule_1 = class AppModule {
    static forRoot(options) {
        return {
            module: AppModule_1,
            imports: [CoreModule.forRoot(options), WalletModule, AuthModule, TableRuntimeModule, GatewayModule, LobbyModule],
        };
    }
};
AppModule = AppModule_1 = __decorate([
    Module({})
], AppModule);
export { AppModule };
//# sourceMappingURL=app.module.js.map