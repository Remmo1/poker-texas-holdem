export type EngineErrorCode = 'INVALID_SETUP' | 'HAND_COMPLETE' | 'NOT_YOUR_TURN' | 'ILLEGAL_ACTION' | 'INVALID_AMOUNT';
export declare class EngineError extends Error {
    readonly code: EngineErrorCode;
    constructor(code: EngineErrorCode, message: string);
}
