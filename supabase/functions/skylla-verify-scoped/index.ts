import { createCapabilityHandler } from '../skylla-verify/capability.mjs';
import plan from '../skylla-verify/allowlist.json' with { type: 'json' };
import capability from './capability.json' with { type: 'json' };

// The deployment tool requires project-management authorization. Gateway JWT is
// replaced ONLY here by the function's explicit scoped cryptographic capability.
Deno.serve(createCapabilityHandler({plan,capability,env:(key:string)=>Deno.env.get(key)}));
