type TenantStorage = {
  enterWith(value: string | null): void;
  getStore(): string | null | undefined;
  run<T>(value: string | null, callback: () => T): T;
};

let tenantStorage: TenantStorage | null = null;

function getTenantStorage(): TenantStorage | null {
  if (tenantStorage) return tenantStorage;
  const builtinLoader = (globalThis as { process?: { getBuiltinModule?: (name: string) => any } }).process?.getBuiltinModule;
  const AsyncLocalStorage = builtinLoader?.('async_hooks')?.AsyncLocalStorage;
  if (AsyncLocalStorage) tenantStorage = new AsyncLocalStorage();
  return tenantStorage;
}

export function setRequestTenant(orgId: string | null): void {
  getTenantStorage()?.enterWith(orgId);
}

export function getRequestTenant(): string | null {
  return getTenantStorage()?.getStore() ?? null;
}

export function runWithTenant<T>(orgId: string | null, callback: () => T): T {
  return getTenantStorage()?.run(orgId, callback) ?? callback();
}
