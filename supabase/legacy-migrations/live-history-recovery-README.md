# LIVE applied migration history recovery

This candidate has a versioned, comment-only active marker for every migration version returned by the LIVE Supabase ledger snapshot. These markers represent already-applied history and intentionally contain no executable SQL. They cannot replay historical schema or data side effects, even if a remote ledger later drifts.

Original SQL from the prior candidate active migration directory is preserved under supabase/legacy-migrations/live-candidate-original-migrations/; the DEV baseline archive remains separate under supabase/legacy-migrations/pre-baseline/. The four LIVE trophy-inspector source migrations remain under supabase/legacy-migrations/live-pre-convergence/. live-history-recovery-manifest.json records all 178 ledger versions, active marker hashes, and archived source/hash when retained. The original SQL is retained for 124 versions; 54 versions have no original SQL in the repository history captured by the checked refs, and are represented only by inert markers.

Only the eight files listed in pending_candidate_migrations in the manifest are executable candidate changes. This chain is a forward-release chain for the existing LIVE database; the no-op historical markers are not a fresh-database bootstrap. No database or migration ledger was changed by creating this structure.
