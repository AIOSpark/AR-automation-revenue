// AIOSpark User & Organization Persistence Layer (Layer 2)
import { deleteSnapshot, readSnapshot, writeSnapshot } from '../db/durable-repository';

export interface UserRecord {
  id: string;
  auth_provider_id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  role_title?: string | null;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  size: string;
  industry: string;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  pilotMode?: boolean;
  currency?: string;
}

// Memory & Storage Store for User Identity and Organization Draft Data
class AuthStore {
  private users: Map<string, UserRecord> = new Map(); // Keyed by user ID
  private authProviderToUserId: Map<string, string> = new Map(); // Keyed by auth_provider_id
  private emailToUserId: Map<string, string> = new Map(); // Keyed by lowercase email
  private organizations: Map<string, OrganizationRecord> = new Map();
  private platformAdmins: Set<string> = new Set(); // Keyed by user ID

  constructor() {
    const state = readSnapshot<{ users: UserRecord[]; organizations: OrganizationRecord[] }>('auth');
    for (const user of state?.users || []) {
      this.users.set(user.id, user);
      this.authProviderToUserId.set(user.auth_provider_id, user.id);
      this.emailToUserId.set(user.email.toLowerCase(), user.id);
    }
    for (const organization of state?.organizations || []) this.organizations.set(organization.id, organization);
  }

  public persistState(): void {
    writeSnapshot('auth', {
      users: Array.from(this.users.values()),
      organizations: Array.from(this.organizations.values()),
    });
  }

  public createUser(data: {
    auth_provider_id: string;
    email: string;
    first_name: string;
    last_name: string;
    phone?: string | null;
    role_title?: string | null;
    email_verified?: boolean;
  }): UserRecord {
    const emailKey = data.email.toLowerCase();
    
    if (this.emailToUserId.has(emailKey)) {
      const existingId = this.emailToUserId.get(emailKey)!;
      return this.users.get(existingId)!;
    }

    const id = `usr_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const now = new Date().toISOString();

    const user: UserRecord = {
      id,
      auth_provider_id: data.auth_provider_id,
      email: data.email,
      first_name: data.first_name,
      last_name: data.last_name,
      phone: data.phone || null,
      role_title: data.role_title || null,
      email_verified: data.email_verified ?? false,
      created_at: now,
      updated_at: now,
    };

    this.users.set(id, user);
    this.authProviderToUserId.set(data.auth_provider_id, id);
    this.emailToUserId.set(emailKey, id);
    this.persistState();

    return user;
  }

  public getUserByEmail(email: string): UserRecord | null {
    const id = this.emailToUserId.get(email.toLowerCase());
    return id ? this.users.get(id) || null : null;
  }

  public getUserByAuthProviderId(authProviderId: string): UserRecord | null {
    const id = this.authProviderToUserId.get(authProviderId);
    return id ? this.users.get(id) || null : null;
  }

  public getUserById(id: string): UserRecord | null {
    return this.users.get(id) || null;
  }

  public getOrganizationById(id: string): OrganizationRecord | null {
    return this.organizations.get(id) || null;
  }

  public updateUserEmailVerified(authProviderId: string, verified: boolean): UserRecord | null {
    const user = this.getUserByAuthProviderId(authProviderId);
    if (user) {
      user.email_verified = verified;
      user.updated_at = new Date().toISOString();
      this.persistState();
      return user;
    }
    return null;
  }

  public createOrganizationDraft(data: {
    name: string;
    size: string;
    industry: string;
    created_by_user_id: string;
  }): OrganizationRecord {
    const id = `org_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const now = new Date().toISOString();

    const org: OrganizationRecord = {
      id,
      name: data.name,
      size: data.size,
      industry: data.industry,
      created_by_user_id: data.created_by_user_id,
      created_at: now,
      updated_at: now,
    };

    this.organizations.set(id, org);
    this.persistState();
    return org;
  }

  public getOrganizationByUserId(userId: string): OrganizationRecord | null {
    for (const org of this.organizations.values()) {
      if (org.created_by_user_id === userId) {
        return org;
      }
    }
    return null;
  }

  public isPlatformAdmin(userId: string): boolean {
    return this.platformAdmins.has(userId);
  }

  public setPlatformAdmin(userId: string, isAdmin: boolean): void {
    if (isAdmin) {
      this.platformAdmins.add(userId);
    } else {
      this.platformAdmins.delete(userId);
    }
  }

  public clearAll(): void {
    this.users.clear();
    this.authProviderToUserId.clear();
    this.emailToUserId.clear();
    this.organizations.clear();
    deleteSnapshot('auth');
  }
}

// Global Singleton for Application Lifecycle
export const authStore = new AuthStore();
