// Exercise the production Pixi/WebGL renderer without credentials or campaign data.
import assert from 'node:assert/strict';
import { mkdir, readdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const [origin, dist, output, version] = process.argv.slice(2);
assert.equal(new URL(origin).hostname, '127.0.0.1');
await mkdir(output, { recursive: true });
const bundle = (await readdir(dist + '/assets')).find(name => /^kartakademin-renderer-.*\.js$/.test(name));
assert.ok(bundle);
const browser = await chromium.launch({ channel:'chrome', args:['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({viewport:{width:1000,height:800}});
  await page.route(/^https?:/, r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
  await page.route('https://unpkg.com/@3d-dice/dice-box@*/dist/dice-box.es.min.js', r =>
    r.fulfill({contentType:'text/javascript', body:'export default class DiceBox {}'}));
  await page.goto(origin);
  await page.evaluate(async bundle => {
    const { mountLighting } = await import('./assets/' + bundle);
    const width=520, height=380;
    const floor=document.createElement('canvas');
    floor.width=width; floor.height=height;
    const ctx=floor.getContext('2d');
    ctx.fillStyle='#e8ded0'; ctx.fillRect(0,0,width,height);
    ctx.strokeStyle='#c6bcad'; ctx.lineWidth=1;
    for(let y=0;y<height;y+=25) for(let x=y%50?-28:0;x<width;x+=56) ctx.strokeRect(x,y,56,25);
    const walls=[[190,160,16,54],[170,238,7,7],[424,0,4,380]];
    for(const [x,y,w,h] of walls) {ctx.fillStyle='#675e50';ctx.fillRect(x,y,w,h)}
    const map={width,height,image_url:floor.toDataURL()};
    const host=document.createElement('div');
    Object.assign(host.style,{position:'fixed',top:'0',left:'0',width:width+'px',height:height+'px',zIndex:'2000000'});
    document.body.append(host);
    const renderer=await mountLighting(host,map);
    const canvas=host.querySelector('canvas');
    Object.assign(canvas.style,{width:'520px',height:'380px',position:'static',display:'block'});
    const runs=[];
    for(let y=0;y<height;y++){
      let start;
      for(let x=0;x<=width;x++){
        const free=x<width && !walls.some(([a,b,w,h])=>x>=a && y>=b && x<a+w && y<b+h);
        if(free && start===undefined) start=x;
        if(!free && start!==undefined) {runs.push([y*width+start,x-start]);start=undefined;}
      }
    }
    const solid={width,height,runs};
    const torch={type:'fackla',color:'#ffbf80',range:5,intensity:1,motion:.18,on:true,
      direction:0,aperture:360,position:[125,190]};
    const other={...torch,position:[370,170],color:'#9dcbff'};
    const config={geometry:[],freeSight:solid,darkness:.85,pixelsPerMeter:100,lights:[torch]};
    const all={status:'explored',shape_type:'rect',shape_data:{x:0,y:0,width,height}};
    const open={width,height,runs:[[0,width*height]]};
    // Drive only this renderer's animation. The app and Playwright keep the
    // browser's normal animation clock for layout and screen capture.
    let tick;
    const raf=window.requestAnimationFrame.bind(window);
    const renderAt=(fn,time)=>{
      window.requestAnimationFrame=cb=>{tick=cb;return 0};
      try {fn(time)} finally {window.requestAnimationFrame=raf}
    };
    window.shadowScenario=(mode,time=0)=>{
      torch.on=mode!=='off';
      torch.type=['magiskt','solljus','manljus'].includes(mode)?mode:'fackla';
      torch.motion=(torch.type === 'fackla' && mode !== 'still') ? .18 : 0;
      config.lights=mode==='two'?[torch,other]:[torch];
      config.freeSight=mode==='open'?open:solid;
      const player=mode==='player';
      const areas=player?[{...all,shape_data:{x:0,y:0,width:200,height}},
        {...all,status:'unknown',shape_data:{x:200,y:0,width:320,height}}]:[all];
      tick=null;
      renderAt(()=>renderer.update(config,areas,[],!player));
      if(tick) renderAt(tick,time);
    };
    window.shadowTick=time=>renderAt(tick,time);
    window.shadowZoom=()=>{host.style.transformOrigin='0 0';host.style.transform='translate(18px, 22px) scale(1.5)'};
    window.closeShadow=()=>renderer.destroy();
  },bundle);
  const view=page.locator('canvas.kartakademin-canvas');
  async function capture(mode,time,filename) {
    await page.evaluate(([mode,time])=>window.shadowScenario(mode,time),[mode,time]);
    return (await view.screenshot(filename?{path:output+'/'+filename}:{})).toString('base64');
  }
  const blocked=await capture('torch',0,'fackla.png');
  const costs=await page.evaluate(()=>{
    const canvas=document.querySelector('canvas.kartakademin-canvas');
    const gl=canvas.getContext('webgl2') || canvas.getContext('webgl');
    const measure=fn=>{const start=performance.now();fn();gl.finish();return performance.now()-start};
    const addSecond=measure(()=>window.shadowScenario('two'));
    const warm=measure(()=>window.shadowScenario('two'));
    const frames=Array.from({length:60},(_,i)=>measure(()=>window.shadowTick(i*16.67))).sort((a,b)=>a-b);
    return {addSecond,warm,frameMedian:frames[30],frameP95:frames[56]};
  });
  console.log('Two-light WebGL timing (ms)',costs);
  if(version!=='baseline') {
    await page.evaluate(()=>window.shadowScenario('torch',0));
    await page.evaluate(()=>window.shadowTick(140*3*Math.PI));
    const moved=(await view.screenshot({path:output+'/fackla-rakurs-2.png'})).toString('base64');
    const open=await capture('open',0);
    const off=await capture('off',0);
    const two=await capture('two',0,'tva-ljus.png');
    const player=await capture('player',0);
    const result=await page.evaluate(async images=>{
      const data=await Promise.all(images.map(async b64=>{
        const image=await createImageBitmap(await(await fetch('data:image/png;base64,'+b64)).blob());
        const canvas=document.createElement('canvas'); canvas.width=image.width;canvas.height=image.height;
        const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);image.close();
        return ctx.getImageData(0,0,canvas.width,canvas.height).data;
      }));
      const channel=(i,x,y,c=0)=>data[i][4*(y*520+x)+c];
      const ratio=(x,y)=>(channel(0,x,y)-channel(3,x,y))/Math.max(1,channel(2,x,y)-channel(3,x,y));
      let moving=0,wallLeak=0; const levels=new Set();
      for(let y=1;y<379;y++) for(let x=1;x<519;x++) {
        if(x>=424) wallLeak=Math.max(wallLeak,channel(0,x,y)-channel(3,x,y));
        if(x===330 && y<180){let r=ratio(x,y);if(r>.04 && r<.96)levels.add(Math.round(r*100))}
        if(x>210 && x<405 && Math.abs(channel(0,x,y)-channel(1,x,y))>3) moving++;
      }
      return {levels:levels.size,moving,wallLeak,core:ratio(310,190), clear:ratio(120,100),
        near:ratio(209,189), small:ratio(180,249), smallFar:ratio(293,368), second:channel(4,310,190,2)-channel(0,310,190,2),
        unknown:channel(5,310,190),explored:channel(5,120,100)};
    },[blocked,moved,open,off,two,player]);
    console.log('Shadow pixel measurements',result);
    assert.ok(result.levels>=6 && result.moving>50,'graded, moving penumbra');
    assert.ok(result.clear>.93 && result.core<.01 && result.near<.01 && result.wallLeak<=1,'solid wall and umbra');
    assert.ok(result.small<.02 && result.smallFar>.08,'small Solid retains contact and loses contrast at distance');
    assert.ok(result.second>10 && result.unknown===0 && result.explored>20,'independent lights and player fog');
    for(const type of ['still','magiskt','solljus','manljus']) {
      const first=await capture(type,0);
      assert.notEqual(first,off);
      assert.equal(await capture(type,2100),first,'stable '+type);
    }
    assert.equal(await capture('torch',0),blocked,'relighting restores the same map position and shading');
    await page.evaluate(()=>{window.shadowScenario('torch');window.shadowZoom()});
    const bounds=await view.boundingBox();assert.equal(bounds.width,780);assert.equal(bounds.x,18);
    await view.screenshot({path:output+'/zoom.png'});
  }
  await page.evaluate(()=>window.closeShadow());
} finally {await browser.close()}
