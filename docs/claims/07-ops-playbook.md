# 07 — Ops playbook

Playbook for factoring / A/R / carrier ops when a broker reports a claim or payments suddenly stop.

## Standard intake questions (send every time)

Use this block with broker Claims (CC carrier):

1. What is the **reason** for the claim?
2. What is the **claim amount**? (estimated or finalized?)
3. Which **load(s) / PO(s)** does the claim pertain to?
4. Is the carrier’s **entire account** on hold, or only specific load(s)?
5. What is the **current status** of the claim?
6. Was the **carrier notified**, and if so, **when**?

### Strong follow-ups

7. Please provide supporting documentation (POD, photos, reefer download, claim notice, invoices).
8. From which email was notice sent, and to which carrier email(s)?
9. Has the carrier been given the **finalized amount**?
10. Is carrier insurance involved? Adjuster name + claim #?
11. What exactly will release the hold (full payment, deductible + insurance remittance, signed release)?
12. If the claim is paid, will the held loads totaling $X be released?

## Carrier update template (when broker reports a claim)

Inform the carrier with:

- Broker name
- Load / PO
- Reason and amount (or “amount not yet provided”)
- Hold scope if known
- That broker will not release payment until resolved
- Ask carrier to confirm accuracy and say what they are doing (insurance, deductible, dispute)
- Offer to open a joint email chain with the broker

## When broker prefers carrier-to-broker communication

Some brokers give limited detail to factoring and expect the **carrier** to dispute with evidence.

**Do this:**

1. Keep factoring on the CC for visibility.
2. Ask the carrier to write the broker with operational facts (temp instructions followed, emails received, etc.).
3. Factoring continues asking for docs, amounts, and hold-release conditions.
4. Track whether supporting docs were actually delivered to the carrier.

## Escalation ladder

| Stage | Action |
| --- | --- |
| Day 0 | Intake questions to Claims; CC carrier |
| No amount / thin reply | Ask again; request docs; set follow-up date |
| Carrier silent | Deadline email: respond or we begin closing invoices for this broker |
| Broker AP silent (non-claim) | Aging escalation / legal notice / no-buy — separate from claim path |
| Insurance settlement stuck on remittance | Demand POP method + trace refs; loop adjuster + broker claims + carrier claims |
| Invoices ~60 days + no resolution | Warn short-close / chargeback; execute if carrier still inactive |
| Short residual payment received | Confirm with carrier before closing invoice |

## Roles checklist inside the ops team

- **Collections / AP chase:** detect missing pays, voided checks, short-pays
- **Claims liaison:** run intake questions, maintain claim file, follow status
- **Carrier success:** keep client informed in plain language; push deductible / insurance action
- **Leadership:** approve short-closes, chargebacks, legal/no-buy escalations

## Status labels (suggested internal)

Use consistent statuses on invoices / claim tickets:

- `Claim suspected` — pay stopped, reason unknown
- `Claim open – amount pending`
- `Claim open – amount known`
- `Docs requested / dispute`
- `With insurance adjuster`
- `Awaiting deductible`
- `Awaiting insurer remittance / tracing`
- `Settlement confirmed – hold release pending`
- `Hold released – awaiting payment`
- `Short-closed due to claim`
- `Claim closed – paid in full`

## Do / don’t

**Do**

- CC the carrier on broker claim threads
- Separate “claim hold” from ordinary AP delay
- Get hold scope in writing
- Verify notification dates and document delivery
- Trace settlement payments until broker applies cash

**Don’t**

- Assume proof of payment = hold released
- Argue liability for the carrier without their facts
- Let 60-day invoices sit without a written go-forward plan
- Trust “entire account” vs “one load” from memory — reconfirm
