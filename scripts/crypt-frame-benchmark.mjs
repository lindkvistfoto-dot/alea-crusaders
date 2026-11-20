// One foreground GM, default two-room scene, normal animation, isolated storage.
export async function measureCryptFrames(browser, origin) {
  const context = await browser.newContext({viewport:{width:1366,height:850}, reducedMotion:'no-preference', deviceScaleFactor:1});
  try {
    await context.route(/^https?:/, route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.routeWebSocket(/.*/, socket => socket.close());
    const page = await context.newPage();
    await page.goto(origin + '/kryptans-dorr.html');
    await page.bringToFront();
    await page.waitForFunction(() => document.querySelector('#scene canvas[data-renderer]') &&
      document.querySelectorAll('#hero-list [data-hero]').length === 3 &&
      document.querySelector('#board').getAttribute('aria-busy') === 'false' && document.visibilityState === 'visible');
    return await page.evaluate(async () => {
      const canvas = document.querySelector('#scene canvas');
      if (document.querySelector('#motion').checked) throw Error('Expected normal motion.');
      const backend = canvas.dataset.renderer;
      const gl = backend === 'pixi-webgl' && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
      const details = gl && gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = details ? gl.getParameter(details.UNMASKED_RENDERER_WEBGL) : backend;
      const draw = [], raf = [];
      const start = performance.now();
      let wasHidden = false;
      const onVisibility = () => { if (document.hidden) wasHidden = true; };
      document.addEventListener('visibilitychange', onVisibility);
      // Renderer calls this once per completed scene draw, after Pixi or Canvas2D submits it.
      window.aleaCryptFrameProbe = () => draw.push(performance.now());
      try {
        await new Promise(resolve => {
          function next() {
            const now = performance.now();
            raf.push(now);
            if (now - start >= 120000) resolve();
            else requestAnimationFrame(next);
          }
          requestAnimationFrame(next);
        });
      } finally {
        delete window.aleaCryptFrameProbe;
        document.removeEventListener('visibilitychange', onVisibility);
      }
      if (wasHidden || draw.length < 2) throw Error('Foreground scene draw sampling was interrupted.');
      function summary(samples) {
        const ms = samples.slice(1).map((v, i) => v - samples[i]).sort((a,b) => a-b);
        const round = n => Math.round(n * 100) / 100;
        const p = percentile => round(ms[Math.ceil(ms.length * percentile) - 1]);
        return {intervals:ms.length, meanHz:round(1000 * ms.length / (samples.at(-1) - samples[0])),
          p50Ms:p(.50), p95Ms:p(.95), p99Ms:p(.99), maxMs:round(ms.at(-1))};
      }
      return {elapsedMs:Math.round(raf.at(-1)-start), backend, renderer, foreground:true,
        canvasPixels:[canvas.width,canvas.height], logicalCanvasWidth:Math.round(canvas.getBoundingClientRect().width),
        scene:'SL · hela kartan · tre figurer · fackla, sol och normal rörelse',
        viewport:[innerWidth,innerHeight], devicePixelRatio, sceneDraw:summary(draw), animationFrame:summary(raf)};
    });
  } finally {
    await context.close();
  }
}
