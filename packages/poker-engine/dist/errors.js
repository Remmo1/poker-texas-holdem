export class EngineError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'EngineError';
    }
}
//# sourceMappingURL=errors.js.map