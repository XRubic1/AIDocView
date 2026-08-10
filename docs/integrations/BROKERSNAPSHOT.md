# BrokerSnapshot (MC / authority lookup)

Credyx uses [BrokerSnapshot](https://brokersnapshot.com) to enrich **MC checks** when a broker is **not in the Credyx catalog** (and for less-known / out-of-network lookups).

This is **authority / identity** data — separate from Credyx **pay-history risk**.

## When it runs

On **Client → Brokers** (`/client/brokers`):

1. Click **MC Lookup** in the toolbar (or the prompt when an MC is unknown / less known).
2. A popup opens with an MC search field.
3. Results show full BrokerSnapshot detail: company, authority, contact/address, fleet & safety, active insurance list, risk flags, and a SAFER link.
4. If the search bar already has an MC, the popup is prefilled.

Credyx pay rating stays separate from Snapshot authority data.

## Architecture

| Piece | Location |
| --- | --- |
| Edge proxy (holds API key) | `supabase/functions/brokersnapshot-proxy/` |
| Browser service | `src/services/brokerSnapshotService.ts` |
| Types | `src/types/brokerSnapshot.ts` |
| Popup UI | `src/components/client/McLookupModal.tsx` |
| Toolbar entry | `src/pages/ClientBrokers.tsx` → **MC Lookup** button |

Auth: same as `openai-proxy` — signed-in **admin** or **carrier** (`app_metadata.client_id`).

Secret: `BROKERSNAPSHOT_API_KEY` (Supabase Edge secret — **never** `VITE_*`).

## Deploy

```bash
# Set secret (do not commit the token)
supabase secrets set BROKERSNAPSHOT_API_KEY=your_token_here

# Deploy function
supabase functions deploy brokersnapshot-proxy
```

API rate limit: **5 requests/second**. Client caches successful MC lookups for 15 minutes in memory.

## Actions supported by the proxy

| `action` | Body | Purpose |
| --- | --- | --- |
| `lookupByMc` (default) | `{ mc: "MC-123456" }` | Company by MC docket |
| `lookupByDot` | `{ dot: "198" }` | Company by USDOT |

## Related

- Shared cache + Credyx field review queue: [`BROKER_SNAPSHOT_CACHE.md`](./BROKER_SNAPSHOT_CACHE.md)
- Stolen ID / risky BOL paperwork: [`docs/fraud/`](../fraud/README.md)
- Credyx broker pay risk: in-app Admin → Broker risk (payment behavior, not Snapshot)
