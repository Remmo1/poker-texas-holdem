import { randomUUID } from 'node:crypto';
const OPEN = 1;
/** A client that lets more than this pile up unread is too slow to keep in sync. */
const MAX_BUFFERED_BYTES = 1_000_000;
const REPLY_CACHE_SIZE = 256;
export class Connection {
    socket;
    bucket;
    id = randomUUID();
    userId = null;
    username = '';
    strikes = 0;
    authTimer = null;
    tables = new Set();
    replies = new Map();
    tail = Promise.resolve();
    constructor(socket, bucket) {
        this.socket = socket;
        this.bucket = bucket;
    }
    /** Messages from one client are handled strictly in arrival order. */
    enqueue(work) {
        this.tail = this.tail.then(work, work);
    }
    /** Remembers the reply to a command so a client retry with the same id gets it again without re-running. */
    remember(id, reply) {
        this.replies.set(id, reply);
        if (this.replies.size > REPLY_CACHE_SIZE)
            this.replies.delete(this.replies.keys().next().value);
    }
    recall(id) {
        return this.replies.get(id);
    }
    send(message) {
        if (this.socket.readyState !== OPEN)
            return;
        if (this.socket.bufferedAmount > MAX_BUFFERED_BYTES) {
            this.socket.close(1013, 'Client too slow');
            return;
        }
        this.socket.send(JSON.stringify(message));
    }
}
//# sourceMappingURL=connection.js.map