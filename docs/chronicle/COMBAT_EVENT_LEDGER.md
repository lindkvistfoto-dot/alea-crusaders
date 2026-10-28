# Chronicle event ledger and game sessions

## Scope in this phase

The database writes resolved attacks and session lifecycle facts into the shared `chronicle_events` append-only ledger. Each row carries campaign/session/combat scope, event type, occurrence and recording times, source quality, schema version, idempotency key, and correction linkage. Attack outcomes keep frequently queried facts in typed columns; session lifecycle context is stored in a versioned JSON payload.

The attack trigger records one `combat.attack_resolved` fact when a `combat_actions` attack reaches `status = 'resolved'` and `result.hit_resolved = true`. This includes misses and fumbles, plus successful attacks after their parry decision is complete. Pending parries are not counted as resolved attacks. The fact is written in the same transaction as the final combat action update.

Starting, pausing, resuming, or ending a `game_sessions` row appends a corresponding session event. Participant changes are also recorded. A combat instance can be linked to a session; newly started combats automatically use the active session in the selected campaign. Existing combats remain unlinked unless explicitly associated later.

## Corrections and effective history

Rows in `chronicle_events` are append-only for app users. Undoing a completed attack by resetting or deleting its combat action appends a `combat.event_correction` fact that references the original event. Replaying that action creates a new resolution ID and a new fact. The source row is not silently overwritten or deleted.

Read `chronicle_effective_events` for facts that remain effective after corrections. Use `event_order` for stable ledger insertion order and `occurred_at` for the game event time. Correction and session events are not attack results.

## Data quality and next event types

`source_quality = 'verified_engine'` means the fact came from a resolved combat or session lifecycle path. Optional details remain nullable. For example, an absent target race is unknown, not proof that the target was not an orc.

The shared ledger is ready to carry more event types, but this phase does not yet capture skill checks, spell attempts, healing, or other state changes. Those should be recorded as structured event-specific facts, including failures as well as successes, and linked to the originating action to prevent double counting. This phase also does not backfill older combat logs or implement badge rules.
