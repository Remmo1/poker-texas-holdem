var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var CoreModule_1;
import { Global, Module } from '@nestjs/common';
import { CONFIG } from '../config/tokens.js';
import { DB } from '../infra/db/db.js';
import { DECK_SOURCE, secureDeckSource } from '../modules/table-runtime/fairness.js';
import { CLOCK, systemClock } from './clock.js';
let CoreModule = CoreModule_1 = class CoreModule {
    static forRoot(options) {
        return {
            module: CoreModule_1,
            providers: [
                { provide: DB, useValue: options.db },
                { provide: CONFIG, useValue: options.config },
                { provide: CLOCK, useValue: options.clock ?? systemClock },
                { provide: DECK_SOURCE, useValue: options.deckSource ?? secureDeckSource },
            ],
            exports: [DB, CONFIG, CLOCK, DECK_SOURCE],
        };
    }
};
CoreModule = CoreModule_1 = __decorate([
    Global(),
    Module({})
], CoreModule);
export { CoreModule };
//# sourceMappingURL=core.module.js.map