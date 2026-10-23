import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

it('recovers from a stalled workshop provider and offers retry',async()=>{
 vi.useFakeTimers();
 try{
  const nodes={arcanePaperDollWorkshopMount:{innerHTML:''},apdwRetryLoad:{addEventListener(_event,handler){this.retry=handler}}};
  const ctx={document:{getElementById:id=>nodes[id]||null},activeUser:()=>({admin:true}),localStorage:{getItem:()=>null},setTimeout,clearTimeout};
  ctx.aleaPaperDollWorkshopData=()=>new Promise(()=>{});
  runInNewContext(readFileSync(new URL('../features/ui/arcane-paper-doll-workshop.js',import.meta.url),'utf8'),ctx);
  const pending=ctx.aleaPaperDollWorkshop.mount();
  await vi.advanceTimersByTimeAsync(10000);
  await pending;
  expect(nodes.arcanePaperDollWorkshopMount.innerHTML).toContain('Försök igen');
  expect(nodes.apdwRetryLoad.retry).toBeTypeOf('function');
 }finally{vi.useRealTimers()}
});
