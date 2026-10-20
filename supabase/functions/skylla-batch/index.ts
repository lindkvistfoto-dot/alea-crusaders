import {createBatchHandler} from '../skylla-verify/batch.mjs';
import plan from './plan.json' with {type:'json'};
import capability from './capability.json' with {type:'json'};
import folders from './folders.json' with {type:'json'};
Deno.serve(createBatchHandler({plan,capability,folders,env:(key:string)=>Deno.env.get(key)}));
