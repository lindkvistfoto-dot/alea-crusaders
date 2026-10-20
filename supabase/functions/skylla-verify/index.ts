import { createHandler } from './core.mjs';
import plan from './allowlist.json' with { type: 'json' };

// Disabled unless a project operator configures one <=1h window and an exact
// authenticated admin UUID. Built-in service-role credentials stay in Supabase.
Deno.serve(createHandler({ plan, env: (key: string) => Deno.env.get(key) }));
