# OPERATION ATHENA – Universal Skill Resolver

## Goal
Every Alea caller must resolve a character's effective skill FV consistently, whether initiated from the character sheet, combat, GM request, or a future event trigger.

## Phase 1 (this PR)
- Pure resolver reads learned FV, then the rule registry's BC attribute and the character's recorded attribute base chance (g).
- No additive bonus: learned FV wins; a missing/zero FV falls back to BC only if defined.
- Shared between character weapon skill targeting and combat shield parry.
- Equipped shield must still match either hand; action economy remains unchanged.
- NPC/monster combat snapshots retain their existing explicit shield FV behavior.

## Phase 2 (separate PR)
- Expose a generic skill request entrypoint to the GM, events, and combat's Other Action.
- Use the existing Expert T20 outcome engine and action controller; do not duplicate roll logic.
- Show effective FV and its source (learned FV / BC attribute) in the UI.

## Phase 3 (separate PR)
- Integrate combat skills such as Draw Weapon and Tactics with their individual rules and action costs.
- Add integration tests for GM-triggered checks, action usage, and persisted results.

## Validation
Astrid's Sköldar uses BC=SMI; SMI g=3 if she has no learned FV. BV is breaking value, not FV. No database mutation or BV mechanics are included.
