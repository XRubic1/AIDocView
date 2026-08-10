# 03 — AI review checks (stolen ID / risky BOL)

Credyx document AI review must flag the critical risky-load patterns during BOL audit and cross-validation so loads cannot quietly auto-approve.

## Checks enforced

| Check ID | What it detects | Default outcome |
| --- | --- | --- |
| `bol_broker_as_shipper_and_receiver` | Rate-con broker name fuzzy-matches **both** BOL `ship_from` and `ship_to` | WARNING → **Needs review** |
| `bol_missing_shipper_receiver_facilities` | BOL lacks usable shipper facility **and** usable receiver facility | WARNING → **Needs review** |
| (prompt) identity-risk guidance | Vision BOL auditor must call out broker-as-both-ends and blank/vague facilities in `flags` | Feeds human review |

Toggleable built-in rules (Settings → Review rules):

- `bol_broker_both_ends_risk`
- `bol_missing_facilities_risk`

## Where it runs in code

1. **BOL vision prompt** — `buildBolValidatorPrompt` in `src/config/documentAiPrompts.ts`  
   Instructs the model to extract `ship_from` / `ship_to` and flag identity-risk party patterns.

2. **Programmatic gate** — `evaluateBolIdentityRiskFlags` in `src/utils/bolIdentityRiskChecks.ts`  
   Called from `runCrossValidation` in `src/services/crossValidationService.ts` so approval cannot rely on the model alone.

3. **UI** — Verification checks grid shows rows for broker-both-ends and missing facilities.

4. **Checklist copy** — `src/config/bolVerificationChecklist.ts` documents the steps for Settings.

## What “usable facility” means in code

A ship-from / ship-to string counts as a facility when it is non-empty and looks like a real location (address digits, street/warehouse tokens, and/or city–state/ZIP), not blanks, “as directed”, or name-only placeholders.

## Ops expectation

If either critical check fails:

1. Do **not** treat the load as delivery-approved.
2. Contact carrier and broker to confirm real pickup/delivery facilities.
3. Consider stolen-ID playbook ([01](./01-stolen-id.md)) when the carrier denies the load or contacts look spoofed.
4. Only clear after a human confirms legitimate facilities / party layout.
