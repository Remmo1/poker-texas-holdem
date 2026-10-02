var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var TableGateway_1;
import { Inject, Logger } from '@nestjs/common';
import { WebSocketGateway } from '@nestjs/websockets';
import { PROTOCOL_VERSION, parseClientMessage } from '@holdem/shared';
import { CLOCK } from '../../core/clock.js';
import { TicketService } from '../auth/ticket.service.js';
import { TableError } from '../table-runtime/table-actor.js';
import { TableRuntime } from '../table-runtime/table-runtime.service.js';
import { Connection } from './connection.js';
import { ConnectionHub } from './connection-hub.js';
import { TokenBucket } from './rate-limiter.js';
const AUTH_TIMEOUT_MS = 5_000;
const MAX_MESSAGE_CHARS = 4_096;
const RATE_CAPACITY = 30;
const RATE_REFILL_PER_SECOND = 15;
const MAX_RATE_STRIKES = 20;
const CLOSE_REPLACED = 4000;
const CLOSE_UNAUTHENTICATED = 4001;
const CLOSE_RATE_LIMITED = 4008;
/** Best-effort id of an invalid command, so the client can match the rejection to its request. */
function extractId(raw) {
    try {
        const id = JSON.parse(raw).id;
        return typeof id === 'string' && id.length > 0 && id.length <= 64 ? id : undefined;
    }
    catch {
        return undefined;
    }
}
let TableGateway = TableGateway_1 = class TableGateway {
    runtime;
    tickets;
    hub;
    clock;
    logger = new Logger(TableGateway_1.name);
    connections = new Map();
    connectionByUser = new Map();
    constructor(runtime, tickets, hub, clock) {
        this.runtime = runtime;
        this.tickets = tickets;
        this.hub = hub;
        this.clock = clock;
    }
    handleConnection(socket) {
        const connection = new Connection(socket, new TokenBucket(RATE_CAPACITY, RATE_REFILL_PER_SECOND, () => this.clock.now()));
        this.connections.set(socket, connection);
        connection.authTimer = this.clock.setTimeout(() => {
            if (!connection.userId)
                socket.close(CLOSE_UNAUTHENTICATED, 'Authentication timeout');
        }, AUTH_TIMEOUT_MS);
        socket.on('message', (data, isBinary) => {
            if (isBinary) {
                socket.close(1003, 'Text frames only');
                return;
            }
            const raw = data.toString();
            connection.enqueue(() => this.onMessage(connection, raw));
        });
    }
    handleDisconnect(socket) {
        const connection = this.connections.get(socket);
        if (!connection)
            return;
        this.connections.delete(socket);
        if (connection.authTimer)
            this.clock.clearTimeout(connection.authTimer);
        this.hub.remove(connection);
        if (connection.userId && this.connectionByUser.get(connection.userId) === connection) {
            this.connectionByUser.delete(connection.userId);
        }
    }
    async onMessage(connection, raw) {
        if (raw.length > MAX_MESSAGE_CHARS)
            return this.reject(connection, undefined, 'BAD_REQUEST', 'Message too large');
        if (!connection.bucket.take()) {
            if (++connection.strikes > MAX_RATE_STRIKES)
                connection.socket.close(CLOSE_RATE_LIMITED, 'Rate limit exceeded');
            return this.reject(connection, undefined, 'RATE_LIMITED', 'Too many messages');
        }
        const parsed = parseClientMessage(raw);
        if (!parsed.ok)
            return this.reject(connection, extractId(raw), 'BAD_REQUEST', 'Invalid message');
        const message = parsed.message;
        const previous = connection.recall(message.id);
        if (previous)
            return connection.send(previous);
        if (message.type !== 'auth.hello' && !connection.userId) {
            this.reject(connection, message.id, 'UNAUTHENTICATED', 'Authenticate first');
            connection.socket.close(CLOSE_UNAUTHENTICATED, 'Not authenticated');
            return;
        }
        let reply;
        try {
            reply = (await this.dispatch(connection, message)) ?? this.ack(message.id);
        }
        catch (error) {
            reply = this.errorReply(message.id, error);
        }
        connection.remember(message.id, reply);
        connection.send(reply);
        if (reply.type === 'cmd.reject' && reply.payload.code === 'UNAUTHENTICATED') {
            connection.socket.close(CLOSE_UNAUTHENTICATED, 'Authentication failed');
        }
    }
    async dispatch(connection, message) {
        switch (message.type) {
            case 'auth.hello':
                return this.authenticate(connection, message.id, message.payload.ticket);
            case 'ping':
                return { v: PROTOCOL_VERSION, type: 'pong', id: message.id, ts: this.clock.now(), payload: { serverTime: this.clock.now() } };
            case 'table.join': {
                const actor = this.requireTable(message.payload.tableId);
                this.hub.subscribe(connection, actor.id);
                this.hub.sendSnapshot(connection, actor);
                return;
            }
            case 'table.leave':
                this.hub.unsubscribe(connection, message.payload.tableId);
                return;
            case 'table.sit': {
                const actor = this.requireJoined(connection, message.payload.tableId);
                await actor.sit({ userId: connection.userId, username: connection.username }, message.payload.seat, BigInt(message.payload.buyIn));
                return;
            }
            case 'table.stand':
                return this.requireJoined(connection, message.payload.tableId).stand(connection.userId);
            case 'table.action': {
                const { tableId, handId, actionSeq, action } = message.payload;
                return this.requireJoined(connection, tableId).act(connection.userId, { handId, actionSeq, action });
            }
            case 'sync.resume': {
                const actor = this.requireJoined(connection, message.payload.tableId);
                const missed = actor.eventsSince(message.payload.lastSeq);
                if (missed === null)
                    this.hub.sendSnapshot(connection, actor);
                else
                    this.hub.sendEvents(connection, actor, missed);
                return;
            }
        }
    }
    authenticate(connection, id, ticket) {
        if (connection.userId)
            throw new TableError('BAD_REQUEST', 'Already authenticated');
        const identity = this.tickets.redeem(ticket);
        if (!identity)
            throw new TableError('UNAUTHENTICATED', 'Invalid or expired ticket');
        // One live session per user: the newest connection wins.
        const existing = this.connectionByUser.get(identity.userId);
        if (existing)
            existing.socket.close(CLOSE_REPLACED, 'Signed in from another connection');
        connection.userId = identity.userId;
        connection.username = identity.username;
        this.connectionByUser.set(identity.userId, connection);
        if (connection.authTimer)
            this.clock.clearTimeout(connection.authTimer);
        return {
            v: PROTOCOL_VERSION,
            type: 'auth.ok',
            id,
            ts: this.clock.now(),
            payload: { userId: identity.userId, username: identity.username, serverTime: this.clock.now() },
        };
    }
    requireTable(tableId) {
        const actor = this.runtime.get(tableId);
        if (!actor)
            throw new TableError('TABLE_NOT_FOUND', 'Table not found');
        return actor;
    }
    requireJoined(connection, tableId) {
        const actor = this.requireTable(tableId);
        if (!this.hub.isSubscribed(connection, tableId))
            throw new TableError('BAD_REQUEST', 'Join the table first');
        return actor;
    }
    ack(id) {
        return { v: PROTOCOL_VERSION, type: 'cmd.ack', id, ts: this.clock.now(), payload: {} };
    }
    reject(connection, id, code, message) {
        connection.send(this.rejection(id, code, message));
    }
    rejection(id, code, message) {
        return { v: PROTOCOL_VERSION, type: 'cmd.reject', ...(id ? { id } : {}), ts: this.clock.now(), payload: { code, message } };
    }
    errorReply(id, error) {
        if (error instanceof TableError && error.code !== 'INTERNAL')
            return this.rejection(id, error.code, error.message);
        this.logger.error('Command failed', error instanceof Error ? error.stack : String(error));
        return this.rejection(id, 'INTERNAL', 'Internal error');
    }
};
TableGateway = TableGateway_1 = __decorate([
    WebSocketGateway({ path: '/ws' }),
    __param(0, Inject(TableRuntime)),
    __param(1, Inject(TicketService)),
    __param(2, Inject(ConnectionHub)),
    __param(3, Inject(CLOCK))
], TableGateway);
export { TableGateway };
//# sourceMappingURL=table.gateway.js.map