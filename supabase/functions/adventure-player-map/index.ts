import { Buffer } from 'node:buffer';
import { PNG } from 'npm:pngjs@7.0.0';
import jpeg from 'npm:jpeg-js@0.4.4';
import { redactRaster } from './mask.js';

const base=Deno.env.get('SUPABASE_URL')!;
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'private, no-store'};
const empty=(status:number)=>new Response(null,{status,headers:cors});

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return empty(204);
  if(req.method!=='POST')return empty(405);
  const jwt=req.headers.get('Authorization');
  if(!jwt)return empty(401);
  try{
    const {map_id:id}=await req.json();
    if(typeof id!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))return empty(400);
    // Resolve access with the caller's JWT before reading any private geometry or pixels.
    const access=await fetch(base+'/rest/v1/campaign_maps?id=eq.'+id+'&player_visible=eq.true&select=id',{
      headers:{apikey:anon,Authorization:jwt}});
    if(!access.ok||!(await access.json()).length)return empty(403);
    const headers={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
    const result=await fetch(base+'/rest/v1/rpc/adventure_raster_plan',{method:'POST',headers,body:JSON.stringify({p_map_id:id})});
    if(!result.ok)return empty(503);
    const plan=await result.json();
    if(!plan)return empty(403);
    let pixels;
    if(plan.areas.some(a=>a.explored)){
      const file=await fetch(base+'/storage/v1/object/authenticated/campaign-maps/'+plan.path.split('/').map(encodeURIComponent).join('/'),{headers});
      if(!file.ok)return empty(503);
      const bytes=new Uint8Array(await file.arrayBuffer());
      if(bytes[0]===0x89)pixels=PNG.sync.read(Buffer.from(bytes.buffer));
      else if(bytes[0]===0xff)pixels=jpeg.decode(bytes,{useTArray:true});
      else {
        const webp=await import('npm:@cwasm/webp@0.1.5');
        pixels=webp.decode(bytes);
      }
      if(pixels.width!==plan.width||pixels.height!==plan.height)return empty(422);
      redactRaster(pixels,plan.areas);
    }else{
      // A uniform pixel scales to the intrinsic map frame without disclosing any art.
      pixels={width:1,height:1,data:new Uint8Array([0,0,0,255])};
    }
    const body=PNG.sync.write(pixels,{filterType:0,deflateLevel:2});
    return new Response(body,{headers:{...cors,'Content-Type':'image/png'}});
  }catch(e){console.error('Player raster failed',e instanceof Error?e.name:'Error');return empty(503);}
});
