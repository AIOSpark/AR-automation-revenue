// AIOSpark Phase 4 - Financial Execution State Machine Types

export type ExecutionState =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'executing'
  | 'committed'
  | 'verifying'
  | 'verified'
  | 'execution_failed'
  | 'verification_failed'
  | 'under_review'
  | 'rejected'
  | 'cancelled';

export type ActionType =
  | 'ALLOCATE_PAYMENT'
  | 'REVERSE_PAYMENT_ALLOCATION'
  | 'ISSUE_CREDIT_NOTE'
  | 'UPDATE_EXCEPTION_STATUS'
  | 'RECORD_PAYMENT_MATCH'
  | 'SEND_CUSTOMER_COMMUNICATION'
  | 'OTHER';

export interface ExecutionRecord {
  id: string;
  organization_id: string;
  requesting_user_id: string | null;
  approving_user_id: string | null;
  action_type: ActionType | string;
  target_entity_type: string;
  target_entity_ids: string[];
  action_payload: Record<string, any>;
  action_payload_hash: string;
  idempotency_key: string;
  approval_request_id: string | null;
  execution_attempt_id: string;
  state: ExecutionState;
  before_state_snapshot: Record<string, any>;
  expected_outcome: Record<string, any>;
  commit_reference: string | null;
  executed_at: string | null;
  committed_at: string | null;
  verified_at: string | null;
  verification_result: Record<string, any> | null;
  failure_reason: string | null;
  failure_classification: string | null;
  recovery_attempts: number;
  created_at: string;
  updated_at: string;
}

export interface ExecutionContext {
  userId: string | null;
  organizationId: string;
  roles?: string[];
  permissions?: string[];
}
