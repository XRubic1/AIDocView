# Tier Differentiation — Feature Specs

Detailed implementation specs for differentiating the **Managed** and **Self-Service**
tiers. High-level context and product rationale live in
[`Managed_vs_SelfService_Spec.md`](../../Managed_vs_SelfService_Spec.md) at the repo root.

## Specs (in recommended implementation order)

| # | Spec | Priority | Why this order |
|---|------|----------|----------------|
| 1 | [Write-Off Approval](./01-write-off-approval.md) | **High** | Active fee-avoidance leak — `written_off` is fee-exempt with zero approval today |
| 2 | [Payment Posting](./02-payment-posting.md) | High | Remittances arrive at the Credyx email; Credyx must be source of truth for confirmed payments |
| 3 | [Payment Corrections — Move Funds & Unprocess](./06-payment-corrections.md) | High | Mis-posted payments are unfixable today; pairs naturally with spec 2 |
| 4 | [Force-Close Tier Gating](./03-force-close.md) | Medium | Mostly conditional rendering + gating one admin action |
| 5 | [Capability Gating Extension](./04-capability-gating.md) | Medium | Closes the "both tiers look identical" gap on the money pages; underpins the other specs |
| 6 | [A/R-Based Billing Model](./07-ar-based-billing.md) | High | Real pricing: $99 base + tiered % of A/R (factoring discount); replaces placeholder $299 flat fee; billed via Payoneer at launch |
| 7 | [Self-Service Batch Review](./05-self-service-batch-review.md) | **Later update** | Documented now for planning; depends on persisted batch notes |

## Target tier behavior at a glance

| Area | Managed | Self-Service |
|---|---|---|
| Batch work (paperwork review, notes) | Credyx A/R representative | Client works own batches *(spec 5, later)* |
| Payment posting | Credyx posts most payments | Client posts → pending until Credyx confirms |
| Write-offs | Hidden Credyx approval | Hidden Credyx approval (same — abuse vector exists for both) |
| Force-close aged loads | Yes, after aging period — collection fee applies | **None** — client handles own collections, no fee |
| Batch creation | Doc handoff only *(already implemented)* | AI + manual *(already implemented)* |

## Conventions used in these specs

- File paths are relative to the repo root.
- "Client portal" = routes under `/client/*`; "admin portal" = internal Credyx routes
  (`/batches`, `/clients`, `/admin/dashboard`, ...).
- The app runs against localStorage/IndexedDB mock stores by default with optional
  Supabase persistence; every data-model change lists both the TypeScript type change
  and the Supabase migration.
- Capability flags refer to `src/utils/clientCapabilities.ts`, consumed through
  `ClientPortalContext` → `useClientCapabilities()`.
