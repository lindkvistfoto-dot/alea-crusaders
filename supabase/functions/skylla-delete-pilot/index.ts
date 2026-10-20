import {createDeletePilotHandler} from '../skylla-verify/delete-pilot.mjs';
import plan from './plan.json' with {type:'json'};
import capability from './capability.json' with {type:'json'};
Deno.serve(createDeletePilotHandler({plan,capability,env:(key:string)=>Deno.env.get(key)}));
