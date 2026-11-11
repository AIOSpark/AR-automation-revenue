# AIOSpark HIGH-011 — Financial RBAC Verification

Date: 2026-11-11
Scope: Financial role-based access control for the current workspace, preserving the HIGH-009/HIGH-010 persistence work.

## Permission model

`src/lib/tenant/permissions.ts` now defines five financial resources:

- `payments`
- `credit_notes`
- `reconciliation`
- `collections`
- `cash_unblock`

Actions: `view`, `create`, `edit`, `delete`, `approve`, `execute`, `reverse`, `export`.

Least-privilege intent:

| Role | Financial authority |
|---|---|
| Owner | Full financial authority, including billing |
| Admin | Full financial authority except billing |
| Finance Manager | Prepare, approve and execute financial operations; no billing control |
| Finance Executive | Prepare and edit payments, reconciliation proposals, collections and cash-unblock work; cannot approve, execute, reverse credit notes or control billing |
| Viewer | Read-only financial access |

## Route enforcement

| Endpoint | Permission |
|---|---|
| `GET /api/payments` | `view payments` |
| `GET /api/reconciliation` | `view reconciliation` |
| `POST /api/reconciliation` upload | `edit reconciliation` |
| `POST /api/reconciliation` run | `execute reconciliation` |
| `GET /api/collections` | `view collections` |
| `POST /api/collections` | `create collections` |
| `GET /api/promises` | `view collections` |
| `POST /api/promises` | `create collections` |
| `GET /api/cash-unblock` | `view cash_unblock` |
| `POST /api/cash-unblock` assign | `edit cash_unblock` |
| `POST /api/cash-unblock` execute | `execute cash_unblock` |
| `POST /api/cash-unblock/simulate` | `view cash_unblock` |
| `GET /api/exceptions` | `view exceptions` |
| `PATCH /api/exceptions` | `edit exceptions`; terminal `approved`/`rejected`/`executed` also requires `approve exceptions` |
| `POST /api/approvals/[id]` | `approve approvals`, plus `approve` on the underlying resource (`credit_notes`, `reconciliation`, or `invoices`) |
| `POST /api/customers` | `create customers` |
| `POST /api/onboarding/import` | `create invoices` |
| `POST /api/copilot/action` | `create approvals` |
| `POST /api/integrations/sync` | `edit integrations` |
| `GET/POST /api/billing` | `view/edit billing` (Owner only) |
| `GET /api/admin/revenue` | Dedicated platform administrator; organization Owner is not sufficient |

Deny-by-default is enforced by `can()` returning `false` for unknown roles, resources, or actions. Tenant resolution validates session membership before the resource is loaded; approval rows additionally check `organization_id` and return 404 on cross-tenant access.

## Credit notes boundary

There is no direct HTTP create/allocation/reversal endpoint for credit notes. Credit-note issuance is reachable through the approval execution path (`ISSUE_CREDIT_NOTE`), which now requires `approve credit_notes` in addition to generic approval permission. No unguarded credit-note API exists.

## Verification

New suite: `npm run test:financial-rbac` (21/21 passed).

It invokes the real route handlers and verifies:

- Viewer denied (403) on reconciliation, collections, cash-unblock, exceptions, customer, promise, import, copilot and integration mutations.
- Finance Executive denied (403) on approval execution, reconciliation execution, terminal exception decisions and cash-unblock execution.
- Owner and Viewer reads succeed for payments, reconciliation, collections, cash-unblock and exceptions.
- An authorized Owner passes the reconciliation gate (reaches input validation, not 403).
- Cross-tenant organization header returns 401.
- Cross-tenant approval returns 404 and cannot be actioned.
- Unauthenticated financial access returns 401.
- Organization Owner cannot access platform revenue (403).
- A dedicated platform administrator can access platform revenue even with a Viewer organization role.

Regression results:

| Check | Result |
|---|---|
| `npm run test:master` | 187/187 |
| `npm run test:security` | 12/12 |
| `npm run test:financial` | 54/54 |
| `npm run test:tenant` | 8/8 |
| `npm run test:financial-rbac` | 21/21 |
| `npx tsc --noEmit` | 0 errors |
| `npm run build` | Success |
| `npm run verify` | Exit 0 |

## Remaining boundary

RBAC is enforced server-side on the routes above. The confirmed cross-process stale-write risks in approvals and billing (HIGH-010 residual) remain a separate data-integrity issue; authorization does not fix concurrent state overwrites. HIGH-012 remains paused.
