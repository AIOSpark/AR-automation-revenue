declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(filename: string, options?: { readonly?: boolean });
    exec(sql: string): void;
    close(): void;
    prepare(sql: string): {
      get(...parameters: unknown[]): unknown;
      all(...parameters: unknown[]): unknown[];
      run(...parameters: unknown[]): unknown;
    };
  }
}
