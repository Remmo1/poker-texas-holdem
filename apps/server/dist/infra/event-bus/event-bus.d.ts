export interface OutboxMessage {
    readonly id: number;
    /** The hand the event belongs to. */
    readonly aggregateId: string;
    readonly type: string;
    readonly payload: unknown;
}
export type OutboxHandler = (message: OutboxMessage) => void | Promise<void>;
export interface EventBus {
    publish(messages: readonly OutboxMessage[]): Promise<void>;
}
export declare const EVENT_BUS: unique symbol;
/** In-process bus; swap for Redis Streams when consumers move to other nodes. */
export declare class InProcessEventBus implements EventBus {
    private readonly handlers;
    subscribe(handler: OutboxHandler): () => void;
    publish(messages: readonly OutboxMessage[]): Promise<void>;
}
