import { createDisplayHandler } from '../skylla-verify/display.mjs';
import plan from './allowlist.json' with { type: 'json' };
import capability from './capability.json' with { type: 'json' };
Deno.serve(createDisplayHandler({plan,capability,env:(key:string)=>Deno.env.get(key)}));
