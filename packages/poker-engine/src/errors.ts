export type EngineErrorCode =
  | 'INVALID_SETUP'
  | 'HAND_COMPLETE'
  | 'NOT_YOUR_TURN'
  | 'ILLEGAL_ACTION'
  | 'INVALID_AMOUNT';

export class EngineError extends Error {
  constructor(
    readonly code: EngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}
