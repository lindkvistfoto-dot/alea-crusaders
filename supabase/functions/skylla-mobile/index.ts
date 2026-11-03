import {createMobileHandler} from '../skylla-verify/mobile.mjs';
import policy from './policy.json' with {type:'json'};
import folders from '../skylla-batch/folders.json' with {type:'json'};
Deno.serve(createMobileHandler({policy,folders,env:(key:string)=>Deno.env.get(key)}));
