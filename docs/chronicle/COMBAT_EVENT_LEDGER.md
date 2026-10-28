# Chronicle combat event ledger

## Scope in this phase

The database records one `combat.attack_resolved` fact when a `combat_actions` attack reaches `status = 'resolved'` and `result.hit_resolved = true`. This includes misses and fumbles, plus successful attacks after their parry decision is complete. A pending parry is not counted as a resolved attack.

The fact is written by a database trigger in the same transaction as the final combat action update. Its stable `resolution_id` makes retries idempotent. The event includes the attacker and target snapshots, target race when available, weapon and attack mode, attack roll and classification, hit location, parry result, damage and KP transition, map and hex positions, rule engine, and raw damage dice.

## Corrections and effective history

Rows in `combat_history_events` are append-only for app users. Undoing a completed attack by resetting or deleting its combat action appends a `combat.event_correction` row that references the original fact. Replaying that action creates a new resolution ID and a new fact. The source row is never silently overwritten or deleted.

Read `combat_history_effective_events` for facts that remain effective after corrections. Use `event_order` for stable ledger insertion order and `occurred_at` for the recorded game event time. Do not count `combat.event_correction` rows as game actions.

## Data quality and limits

`source_quality = 'verified_engine'` means the fact came from the combat engine's resolved action path. Optional details remain nullable. For example, an absent target race is unknown, not proof that the target was not an orc.

This phase does not backfill older `combat_log` messages or capture skill checks, spells, sessions, campaign narration, or non-combat activity. It also does not create a badge rule engine. Future criteria should query the effective event view and report when required evidence is missing.
