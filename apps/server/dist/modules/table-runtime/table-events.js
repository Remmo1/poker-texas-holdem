var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Injectable } from '@nestjs/common';
/** Decouples the table runtime from whatever delivers events (WebSocket hub today, other consumers later). */
let TableEvents = class TableEvents {
    listeners = new Set();
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    emit(tableId, broadcast) {
        for (const listener of this.listeners) {
            try {
                listener(tableId, broadcast);
            }
            catch {
                // One faulty listener must not stop delivery to the others or break the table.
            }
        }
    }
};
TableEvents = __decorate([
    Injectable()
], TableEvents);
export { TableEvents };
//# sourceMappingURL=table-events.js.map