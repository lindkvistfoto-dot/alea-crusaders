#!/usr/bin/env node
/* HERMES 1.0 — non-destructive check of registered image profiles.
 * No network, no credentials, no writes, and no database modifications.
 * The Pillow pipeline separately checks exact decoded alpha-pixel preservation.
 */
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const load=path=>readFileSync(resolve(root,path));
const config=JSON.parse(load('config/hermes-profiles.json').toString('utf8'));
assert.equal(config.protocol,'HERMES');
assert.equal(config.version,'1.0');
assert.equal(config.policy,'forward-only');
const profile=config.profiles['arcane-ivory-spell-icon'];
assert.equal(profile.status,'active');
assert.equal(profile.source_format,'png');
assert.equal(profile.delivery_format,'webp');
assert.equal(profile.transparency,'required-preserved');
const index=JSON.parse(load(profile.manifest).toString('utf8'));
assert.equal(index.edge,profile.delivery_width);
assert.equal(index.edge,profile.delivery_height);
assert.equal(index.max_bytes,profile.max_bytes);
assert.ok(Array.isArray(index.icons)&&index.icons.length>0,'No registered ARCANE IVORY icons');
const directory=resolve(root,profile.master_dir);
const names=readdirSync(directory);
const originalNames=names.filter(x=>x.endsWith('.png')).sort();
assert.equal(index.icons.length,originalNames.length,'Every original must be listed in the manifest');
const encountered=new Set();
let totalOriginal=0,totalDelivery=0;
for(const entry of index.icons){
  const key=entry.spell_key;
  assert.match(key,/^[a-z0-9]+(?:-[a-z0-9]+)*$/,'Unsafe spell key');
  assert.ok(!encountered.has(key),'Duplicate spell key: '+key);
  encountered.add(key);
  const master=key+'.png',delivery=key+'.webp';
  assert.equal(entry.source,master);
  assert.equal(entry.app,delivery);
  assert.ok(originalNames.includes(master),'Missing PNG original: '+master);
  assert.ok(names.includes(delivery),'Missing optimized WebP: '+delivery);
  const png=readFileSync(resolve(directory,master));
  const webp=readFileSync(resolve(directory,delivery));
  assert.ok(png.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')),'Invalid PNG: '+master);
  assert.equal(png.toString('ascii',12,16),'IHDR','Missing PNG IHDR: '+master);
  const w=png.readUInt32BE(16),h=png.readUInt32BE(20);
  assert.ok(w===h&&w>=profile.delivery_width,'Original must be square and sufficiently large: '+master);
  const colorType=png[25];
  const hasAlpha=[4,6].includes(colorType)||png.includes(Buffer.from('tRNS'));
  assert.ok(hasAlpha,'Original lacks alpha support: '+master);
  assert.equal(entry.source_bytes,png.length,'Original byte count mismatch: '+master);
  assert.equal(entry.source_sha256,createHash('sha256').update(png).digest('hex'),'Original checksum mismatch: '+master);
  assert.ok(webp.toString('ascii',0,4)==='RIFF'&&webp.toString('ascii',8,12)==='WEBP','Invalid WebP: '+delivery);
  assert.equal(entry.app_bytes,webp.length,'App byte count mismatch: '+delivery);
  assert.ok(webp.length<=profile.max_bytes,'App image exceeds budget: '+delivery);
  assert.equal(entry.size,profile.delivery_width);
  assert.equal(entry.alpha_preserved,true,'Missing transparency verification: '+delivery);
  totalOriginal+=png.length;totalDelivery+=webp.length;
  console.log('HERMES OK: '+key+' '+png.length+' -> '+webp.length+' bytes');
}
const webps=names.filter(x=>x.endsWith('.webp')).sort();
assert.deepEqual(webps,[...encountered].map(x=>x+'.webp').sort(),'Orphan app WebPs must be reconciled');
const saving=(100*(1-totalDelivery/totalOriginal)).toFixed(1);
console.log('HERMES PASS: '+encountered.size+' active icons, '+saving+'% smaller total, original files unchanged');
