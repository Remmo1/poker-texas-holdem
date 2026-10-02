import type { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import type { WebSocket } from 'ws';
import type { Clock } from '../../core/clock.js';
import { TicketService } from '../auth/ticket.service.js';
import { TableRuntime } from '../table-runtime/table-runtime.service.js';
import { ConnectionHub } from './connection-hub.js';
export declare class TableGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private readonly runtime;
    private readonly tickets;
    private readonly hub;
    private readonly clock;
    private readonly logger;
    private readonly connections;
    private readonly connectionByUser;
    constructor(runtime: TableRuntime, tickets: TicketService, hub: ConnectionHub, clock: Clock);
    handleConnection(socket: WebSocket): void;
    handleDisconnect(socket: WebSocket): void;
    private onMessage;
    private dispatch;
    private authenticate;
    private requireTable;
    private requireJoined;
    private ack;
    private reject;
    private rejection;
    private errorReply;
}
