import { readSnapshot, writeSnapshot } from '../db/durable-repository';

interface RevokedSessionRecord {
  jti: string;
  exp: number;
}

class SessionRevocationStore {
  private revoked = new Map<string, number>();

  constructor() {
    const persisted = readSnapshot<RevokedSessionRecord[]>('auth_session_revocations') || [];
    const now = Math.floor(Date.now() / 1000);
    for (const record of persisted) {
      if (record.jti && record.exp > now) {
        this.revoked.set(record.jti, record.exp);
      }
    }
  }

  public revoke(jti: string, exp: number): void {
    this.prune();
    this.revoked.set(jti, exp);
    this.persist();
  }

  public isRevoked(jti: string): boolean {
    const exp = this.revoked.get(jti);
    return typeof exp === 'number' && exp > Math.floor(Date.now() / 1000);
  }

  public clearAll(): void {
    this.revoked.clear();
    writeSnapshot('auth_session_revocations', []);
  }

  private prune(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [jti, exp] of this.revoked) {
      if (exp <= now) this.revoked.delete(jti);
    }
  }

  private persist(): void {
    writeSnapshot(
      'auth_session_revocations',
      Array.from(this.revoked.entries()).map(([jti, exp]) => ({ jti, exp }))
    );
  }
}

export const sessionRevocationStore = new SessionRevocationStore();
