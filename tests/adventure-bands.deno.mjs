import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {zipSync,strToU8} from 'npm:fflate@0.8.2';
import {PNG} from 'npm:pngjs@7.0.0';
import {projectBands} from '../supabase/functions/adventure-player-map/bands.js';

// Two solid lossless WebP strips, exercising a strip boundary and a partial final strip.
const strips={
  'size.json':strToU8('[4,129]'),
  '0.image':Buffer.from('UklGRh4AAABXRUJQVlA4TBEAAAAvA8AfAAdQkF51ov+BiOh/AAA=','base64'),
  '128.image':Buffer.from('UklGRh4AAABXRUJQVlA4TBEAAAAvAwAAAAdQkF51ov+BiOh/AAA=','base64')
};
const plan={width:4,height:129,areas:[
  {explored:true,shape_type:'rect',shape_data:{x:0,y:126,width:3,height:3}},
  {explored:false,shape_type:'rect',shape_data:{x:1,y:127,width:1,height:2}}
]};

Deno.test('returns a decodable player PNG with concealed pixels black across strip boundaries',async()=>{
  const result=PNG.sync.read(await projectBands(zipSync(strips),plan));
  assert.deepEqual([result.width,result.height],[plan.width,plan.height]);
  for(let y=0;y<result.height;y++){
    for(let x=0;x<result.width;x++){
      const visible=y>=126 && x<3 && !(x===1 && y>=127);
      const offset=4*(y*result.width+x);
      assert.deepEqual([...result.data.subarray(offset,offset+4)],visible?[87,32,19,255]:[0,0,0,255]);
    }
  }
});

Deno.test('propagates a corrupt visible strip without publishing a partial PNG',async()=>{
  await assert.rejects(projectBands(zipSync({...strips,'128.image':new Uint8Array(4)}),plan));
});
