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

export const EVENT_BUS = Symbol('EVENT_BUS');

/** In-process bus; swap for Redis Streams when consumers move to other nodes. */
export class InProcessEventBus implements EventBus {
  private readonly handlers = new Set<OutboxHandler>();

  subscribe(handler: OutboxHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async publish(messages: readonly OutboxMessage[]): Promise<void> {
    for (const message of messages) {
      for (const handler of this.handlers) await handler(message);
    }
  }
}
