# Broker Snapshot cache & Credyx review

When carriers use **MC Lookup**, Credyx caches BrokerSnapshot results and only refreshes on a schedule so API quota is not burned by repeated lookups of the same MC.

## Review windows (configurable)

Defaults (override in **Admin → Settings → System → Broker Snapshot**):

| Situation | Cache / next refresh |
| --- | --- |
| Normal broker (insurance OK) | **30 days** (`cacheTtlDays`) |
| Missing / cancelled / weak insurance | **5 days** (`insuranceWatchTtlDays`) |

Stored in `platform_settings` key `broker_snapshot_ttl`. The Edge Function reads these values (1-minute in-memory cache).

Within the window, every carrier who looks up that MC gets the **same cached payload** (lookup count increments; no new Snapshot API call).

When the window expires, the **next** carrier lookup:

1. Calls BrokerSnapshot again
2. Overwrites the cache
3. Diffs against the Credyx `brokers` row (if any)
4. Creates **pending field changes** for Credyx
5. Notifies admin

## Queued outcomes

| Case | What Credyx sees |
| --- | --- |
| MC not in Credyx directory | Pending **Add broker** change |
| MC in Credyx but Snapshot differs (name, phone, address, insurance status, …) | One pending row **per field** |
| Inactive / cancelled insurance | Insurance status change + 5-day refresh window |

## Admin UI

Path: **`/admin/broker-snapshot`** (nav: Broker Snapshot)

For each pending change Credyx can:

- **Update** / **Add broker** — apply that field (or create the broker) individually
- **Dismiss** — keep Credyx data as-is

## Tables

- `broker_external_snapshots` — cached payload, `fetched_at`, `next_review_at`, `lookup_count`
- `broker_snapshot_changes` — pending / applied / dismissed / stale field diffs

## Edge Function

`brokersnapshot-proxy` action `lookupByMc`:

1. Auth carrier/admin
2. Read cache by `mc_digits`
3. If `next_review_at` in the future → return cache (`_meta.fromCache: true`)
4. Else → Snapshot API → upsert cache → insert diffs → return fresh data

## Deploy

```bash
npx supabase db push
npx supabase functions deploy brokersnapshot-proxy
```
