// Exercise the same built entry and role invitations that Zeus opens in a preview.
// All campaign services are offline in this browser test. Local BroadcastChannel carries the projections.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

export async function verifyCryptPilot(browser, origin, output='visual-results/after/crypt') {
  assert.equal(new URL(origin).hostname,'127.0.0.1');
  await mkdir(output,{recursive:true});
  const context=await browser.newContext({viewport:{width:1366,height:850}});
  const errors=[], measurements=[];
  await context.route(/^https?:/,route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  // Hold the anonymous cross-device relay offline while testing local restoration.
  await context.routeWebSocket(/supabase\.co/,socket=>socket.close());
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  const ready=page=>page.waitForFunction(()=>document.querySelector('#scene canvas') &&
    document.querySelectorAll('#hero-list [data-hero]').length===3 && document.querySelector('#board').getAttribute('aria-busy')==='false');
  const door=(page,name)=>page.waitForFunction(expected=>document.getElementById('door-value').textContent.toLocaleLowerCase('sv').includes(expected),name);
  try {
    const gm=await context.newPage();
    await gm.goto(origin+'/kryptans-dorr.html');
    await ready(gm);
    await gm.screenshot({path:output+'/01-spelledare.png'});
    await gm.locator('#settings summary').click();
    await gm.locator('#prepare').click();
    await gm.locator('[data-footprint]').selectOption('giant7');
    assert.match(await gm.locator('[data-clearance]').textContent(),/för bred/);
    await gm.locator('.crypt-prep [type="submit"]').click();
    await gm.locator('.crypt-prep').waitFor({state:'detached'});
    await gm.locator('#settings summary').click();
    const players=[];
    for (const hero of ['astrid','lyra']) {
      await gm.locator('#invite').click();
      await gm.locator('#invite-actor').selectOption(hero);
      const link=await gm.locator('#open-invite').getAttribute('href');
      assert.ok(link.includes('#player=') && !link.includes('gm='));
      await gm.locator('#invite-dialog .dialog-close').click();
      const player=await context.newPage();
      await player.goto(link);await ready(player);
      assert.ok(await player.locator('#gm-tools').isHidden());
      players.push(player);
    }
    await players[0].bringToFront();
    assert.ok(await players[0].locator('#observed').isHidden());
    const before=await players[0].locator('#scene canvas').screenshot();
    for (const expected of ['öppen','stängd','öppen']) {
      const started=performance.now();
      await gm.bringToFront();
      await gm.locator('#door-action').click();
      await Promise.all(players.map(page=>door(page,expected)));
      measurements.push(Math.round(performance.now()-started));
      for (const player of players) {
        const observed=player.locator('#observed');
        if (expected==='öppen') assert.match(await observed.innerText(),/Kryptväktaren ses av/);
        else assert.ok(await observed.isHidden());
      }
    }
    await players[0].bringToFront();
    await players[0].screenshot({path:output+'/02-spelare-oppen-dorr.png'});
    const after=await players[0].locator('#scene canvas').screenshot();
    assert.ok(!after.equals(before));
    await players[1].locator('#search').click();
    await gm.waitForFunction(()=>document.querySelector('#journal').textContent.includes('Finna dolda ting'));
    await gm.locator('#combat-action').click();
    await Promise.all(players.map(page=>page.waitForFunction(()=>document.querySelector('#phase').textContent.includes('Strid'))));
    await gm.locator('#combat-action').click();
    await players[0].waitForFunction(()=>document.querySelector('#phase').textContent.includes('Äventyr'));
    await gm.locator('#door-action').click();await door(players[0],'stängd');
    await gm.reload();await ready(gm);await door(gm,'stängd');
    await players[1].reload();await ready(players[1]);await door(players[1],'stängd');
    await players[1].bringToFront();
    await players[1].setViewportSize({width:390,height:844});
    await players[1].locator('[data-camera="person"]').click();
    await players[1].screenshot({path:output+'/03-mobil-person.png',fullPage:true});
    assert.ok(await players[1].evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
    assert.deepEqual(errors,[]);
    console.log('Kryptans dörr · SL, två spelare, kartförberedelse, dörr, slag, strid, omladdning och mobil OK.',measurements);
    await writeFile(output+'/kontroll.json',JSON.stringify({viewports:['1366x850','390x844'],doorToBothClientsMs:measurements,exceptions:errors},null,2));
  } finally {await context.close();}
}
