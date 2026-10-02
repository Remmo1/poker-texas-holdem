export interface Migration {
    readonly name: string;
    readonly sql: string;
}
export declare const migrations: readonly Migration[];
