// AIOSpark Read-Only Pilot Access Grant (server-only)
// Provides controlled, temporary read-only pilot access to a curated subset of
// product features, independent of Razorpay billing and without activating a
// paid subscription.
//
// A pilot grant is issued only by an explicitly authorized platform
// administrator, is bounded by an explicit feature list and an expiry, is
// read-only, is organization-isolated, and is fully auditable. It never
// unlocks financial execution, buyer communication, ERP writebacks, or any
// mutation API, and it never overrides RBAC, tenant isolation or the global
// pilot-mode mutation restrictions.
import 'server-only';

import { AuditService } from '../audit/service';
import { authStore } from '../auth/store';
import { deleteSnapshot, readSnapshot, writeSnapshot } from '../db/durable-repository';

// Features that may be granted during a controlled read-only pilot. Each is a
// read-only view of an existing, verified feature whose entitlement code matches
// the billing entitlement engine; none is a mutation or execution capability.
export const APPROVED_PILOT_FEATURES: ReadonlySet<string> = new Set([
  'receivables',
  'customer_360',
  'cash_unblock',
  'cfo_intelligence',
  'causal_graph',
  'reports',
]);

export type PilotFeature = string;

export type PilotGrantStatus = 'active' | 'expired' | 'revoked';

export interface PilotAccessGrant {
  id: string;
  organization_id: string;
  granted_by: string;
  granted_by_user_id?: string | null;
  approved_features: PilotFeature[];
  read_only: boolean;
  pilot_charter_reference?: string | null;
  starts_at: string;
  expires_at: string | null;
  status: PilotGrantStatus;
  revoked_at: string | null;
  revoked_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PilotAccessCheck {
  allowed: boolean;
  organization_id: string;
  feature?: string | null;
  features: PilotFeature[];
  reason?: string | null;
  expires_at: string | null;
}

type PilotGrantState = {
  grants: PilotAccessGrant[];
};

class PilotAccessEngine {
  private grants: Map<string, PilotAccessGrant> = new Map();

  constructor() {
    const state = readSnapshot<PilotGrantState>('pilot_access');
    for (const grant of state?.grants || []) this.grants.set(grant.id, grant);
  }

  private persist(): void {
    writeSnapshot('pilot_access', { grants: Array.from(this.grants.values()) });
  }

  private now(): string {
    return new Date().toISOString();
  }

  /**
   * Determine whether a user is an explicitly authorized platform administrator.
   * Only platform administrators may issue pilot grants.
   */
  private assertPlatformAdmin(userId: string): void {
    if (!authStore.isPlatformAdmin(userId)) {
      throw new Error('Only a platform administrator may issue or revoke pilot access grants.');
    }
  }

  /**
   * Normalize and validate the requested feature list against the approved
   * read-only pilot feature whitelist.
   */
  private normalizeFeatures(features: string[]): PilotFeature[] {
    const seen = new Set<string>();
    const result: PilotFeature[] = [];
    for (const feature of features) {
      if (!feature || typeof feature !== 'string') continue;
      const f = feature.trim();
      if (!f || seen.has(f)) continue;
      if (!APPROVED_PILOT_FEATURES.has(f)) {
        throw new Error(`Feature '${f}' is not an approved read-only pilot feature.`);
      }
      seen.add(f);
      result.push(f as PilotFeature);
    }
    return result;
  }

  /**
   * Mark any grants whose expiry has passed as expired.
   */
  private expireGrantsInternal(): void {
    const nowMs = Date.now();
    let changed = false;
    for (const grant of this.grants.values()) {
      if (grant.status === 'active' && grant.expires_at && new Date(grant.expires_at).getTime() <= nowMs) {
        grant.status = 'expired';
        grant.updated_at = this.now();
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  /**
   * Issue a read-only pilot access grant for an organization.
   * Requires an explicitly authorized platform administrator.
   */
  public grantPilotAccess(params: {
    organization_id: string;
    granted_by: string;
    granted_by_user_id?: string | null;
    approved_features: string[];
    read_only?: boolean;
    pilot_charter_reference?: string | null;
    starts_at?: string | null;
    expires_at?: string | null;
  }): PilotAccessGrant {
    this.assertPlatformAdmin(params.granted_by);

    if (!params.organization_id || typeof params.organization_id !== 'string') {
      throw new Error('organization_id is required.');
    }
    const org = authStore.getOrganizationById(params.organization_id);
    if (!org) {
      throw new Error(`Organization '${params.organization_id}' not found.`);
    }

    const features = this.normalizeFeatures(params.approved_features || []);
    if (features.length === 0) {
      throw new Error('At least one approved read-only feature must be granted.');
    }

    // Pilot access is read-only by construction.
    const read_only = params.read_only !== false;

    const now = new Date();
    const starts_at = params.starts_at ? new Date(params.starts_at) : now;
    const expires_at = params.expires_at ? new Date(params.expires_at) : null;
    if (!expires_at || expires_at.getTime() <= starts_at.getTime()) {
      throw new Error('expires_at must be after starts_at.');
    }

    // Revoke any existing active grant for this organization before issuing a
    // new one, so an organization holds at most one active pilot grant.
    for (const grant of this.grants.values()) {
      if (grant.organization_id === params.organization_id && grant.status === 'active') {
        grant.status = 'revoked';
        grant.revoked_at = this.now();
        grant.revoked_by = params.granted_by;
        grant.updated_at = this.now();
      }
    }

    const id = `pilot_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const grant: PilotAccessGrant = {
      id,
      organization_id: params.organization_id,
      granted_by: params.granted_by,
      granted_by_user_id: params.granted_by_user_id ?? null,
      approved_features: features,
      read_only,
      pilot_charter_reference: params.pilot_charter_reference ?? null,
      starts_at: starts_at.toISOString(),
      expires_at: expires_at.toISOString(),
      status: 'active',
      revoked_at: null,
      revoked_by: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    this.grants.set(id, grant);
    this.persist();

    AuditService.record({
      organization_id: params.organization_id,
      actor_user_id: params.granted_by_user_id ?? null,
      actor_type: 'system',
      action_type: 'pilot_access.granted',
      subject_type: 'organization',
      subject_id: params.organization_id,
      after_state: {
        grant_id: id,
        features,
        read_only,
        expires_at: grant.expires_at,
        pilot_charter_reference: grant.pilot_charter_reference,
      },
      result: 'success',
    });

    return grant;
  }

  /**
   * Revoke an active pilot grant immediately. Requires a platform administrator.
   */
  public revokePilotAccess(params: {
    grant_id: string;
    revoked_by: string;
    revoked_by_user_id?: string | null;
  }): PilotAccessGrant | null {
    this.assertPlatformAdmin(params.revoked_by);

    const grant = this.grants.get(params.grant_id);
    if (!grant) return null;
    if (grant.status !== 'active') return grant;

    grant.status = 'revoked';
    grant.revoked_at = this.now();
    grant.revoked_by = params.revoked_by;
    grant.updated_at = this.now();
    this.persist();

    AuditService.record({
      organization_id: grant.organization_id,
      actor_user_id: params.revoked_by_user_id ?? null,
      actor_type: 'system',
      action_type: 'pilot_access.revoked',
      subject_type: 'organization',
      subject_id: grant.organization_id,
      after_state: { grant_id: grant.id, status: 'revoked', revoked_at: grant.revoked_at },
      result: 'success',
    });

    return grant;
  }

  /**
   * Expire any grants whose expiry has passed. Safe to call periodically.
   */
  public expireGrants(): PilotAccessGrant[] {
    this.expireGrantsInternal();
    return Array.from(this.grants.values()).filter((g) => g.status === 'expired');
  }

  /**
   * Get the active (non-expired, non-revoked) pilot grant for an organization,
   * if any.
   */
  public getPilotAccess(organization_id: string): PilotAccessGrant | null {
    this.expireGrantsInternal();
    return (
      Array.from(this.grants.values()).find(
        (g) => g.organization_id === organization_id && g.status === 'active'
      ) ?? null
    );
  }

  /**
   * Check whether an organization has active pilot access to a specific
   * read-only feature. Does not unlock mutations or execution.
   */
  public hasPilotFeatureAccess(organization_id: string, feature: string): boolean {
    const grant = this.getPilotAccess(organization_id);
    if (!grant) return false;
    return grant.approved_features.includes(feature as PilotFeature);
  }

  /**
   * Check pilot access for an organization and feature, returning a detailed
   * result suitable for API responses.
   */
  public checkPilotAccess(organization_id: string, feature?: string): PilotAccessCheck {
    this.expireGrantsInternal();
    const grant = this.getPilotAccess(organization_id);
    if (!grant) {
      return {
        allowed: false,
        organization_id,
        feature: feature ?? null,
        features: [],
        reason: 'No active pilot access grant for this organization.',
        expires_at: null,
      };
    }
    const features = [...grant.approved_features];
    if (feature) {
      return {
        allowed: grant.approved_features.includes(feature as PilotFeature),
        organization_id,
        feature,
        features,
        reason: grant.approved_features.includes(feature as PilotFeature)
          ? null
          : `Feature '${feature}' is not included in the active pilot grant.`,
        expires_at: grant.expires_at,
      };
    }
    return {
      allowed: true,
      organization_id,
      feature: null,
      features,
      reason: null,
      expires_at: grant.expires_at,
    };
  }

  /**
   * Whether the organization has any active pilot grant (feature-agnostic).
   */
  public isPilotOrganization(organization_id: string): boolean {
    return this.getPilotAccess(organization_id) !== null;
  }

  public getGrant(grant_id: string): PilotAccessGrant | null {
    return this.grants.get(grant_id) ?? null;
  }

  public listGrants(organization_id?: string): PilotAccessGrant[] {
    const grants = Array.from(this.grants.values());
    if (organization_id) {
      return grants.filter((g) => g.organization_id === organization_id);
    }
    return grants;
  }

  public clearAll(): void {
    this.grants.clear();
    deleteSnapshot('pilot_access');
  }
}

export const pilotAccessEngine = new PilotAccessEngine();
