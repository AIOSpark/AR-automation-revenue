declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(filename: string);
    exec(sql: string): void;
    prepare(sql: string): {
      get(...parameters: unknown[]): unknown;
      run(...parameters: unknown[]): unknown;
    };
  }
}
