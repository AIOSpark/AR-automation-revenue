import { withWriteTransaction } from '../db/durable-repository';
import {
  backfillOperationalFromSnapshots,
  clearRevokedSessions,
  deleteExpiredRevokedSessions,
  insertRevokedSession,
  readRevokedSessions,
} from '../db/operational-repository';

class SessionRevocationStore {
  private revoked = new Map<string, number>();

  constructor() {
    backfillOperationalFromSnapshots();
    this.reloadFromDurableState();
  }

  private reloadFromDurableState(): void {
    backfillOperationalFromSnapshots();
    const now = Math.floor(Date.now() / 1000);
    this.revoked = new Map(
      readRevokedSessions()
        .filter((record) => record.jti && record.exp > now)
        .map((record) => [record.jti, record.exp]),
    );
  }

  public revoke(jti: string, exp: number): void {
    withWriteTransaction(() => {
      const now = Math.floor(Date.now() / 1000);
      deleteExpiredRevokedSessions(now);
      insertRevokedSession(jti, exp);
      this.reloadFromDurableState();
    });
  }

  public isRevoked(jti: string): boolean {
    this.reloadFromDurableState();
    const exp = this.revoked.get(jti);
    return typeof exp === 'number' && exp > Math.floor(Date.now() / 1000);
  }

  public clearAll(): void {
    withWriteTransaction(() => {
      clearRevokedSessions();
      this.revoked.clear();
    });
  }
}

export const sessionRevocationStore = new SessionRevocationStore();
