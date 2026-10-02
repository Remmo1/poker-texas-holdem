export const DB = Symbol('DB');
/** bigint columns are read as text and converted here. */
export const toChips = (value) => BigInt(value);
//# sourceMappingURL=db.js.map