export const EVENT_BUS = Symbol('EVENT_BUS');
/** In-process bus; swap for Redis Streams when consumers move to other nodes. */
export class InProcessEventBus {
    handlers = new Set();
    subscribe(handler) {
        this.handlers.add(handler);
        return () => this.handlers.delete(handler);
    }
    async publish(messages) {
        for (const message of messages) {
            for (const handler of this.handlers)
                await handler(message);
        }
    }
}
//# sourceMappingURL=event-bus.js.map