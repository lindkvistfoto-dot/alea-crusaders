"""Chromium + real combat runtime + isolated PostgreSQL integration.

Run test-sisyphus-postgres.py first. The HTTP adapter substitutes local test SQL
for PostgREST; no production credentials or authenticated Supabase are simulated.
Dice are deterministic. Range/LoS, hit location, XP, VFX and area ticks are outside
this fixture; attack damage, action coordination, parries and SQL claims are real.
Requires Python playwright, psycopg2-binary and system chromium.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import urlparse, parse_qs
import json
import os
import uuid

import psycopg2
from psycopg2 import sql
from psycopg2.extras import RealDictCursor, Json
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
WORK=Path(os.environ.get('SISYPHUS_WORK_DIR',ROOT/'work'/'sisyphus-postgres'))
FIXTURE=json.loads((WORK/'browser-fixture.json').read_text())
assert parse_qs(urlparse(FIXTURE['uri']).query).get('host',[''])[0].startswith('/'), 'Only an isolated local Unix-socket fixture is supported'
TABLES={'combat_actions','combatants','combat_instances','combat_log','characters'}
RPCS={'combat_plan_two_weapons','combat_claim_weapon_action','combat_claim_hit','combat_set_hand_equipment','combat_advance_turn','combat_undo_ammunition','haj_restore_combatant'}


def connection(player=False):
 c=psycopg2.connect(FIXTURE['uri']);c.autocommit=True
 with c.cursor() as q:
  q.execute('set role authenticated')
  q.execute("select set_config('request.jwt.claim.sub',%s,false)",(FIXTURE['player' if player else 'gm'],))
 return c


def execute(statement,args=(),player=False):
 with connection(player) as c,c.cursor(cursor_factory=RealDictCursor) as q:
  q.execute(statement,args)
  return [dict(row) for row in q.fetchall()] if q.description else []


def section(text,start,end):
 return text[text.index(start):text.index(end,text.index(start)+len(start))]


legacy=(ROOT/'legacy/app.js').read_text()
helpers='\n'.join([
 section(legacy,'function baseGroup(','function damageBonus('),
 section(legacy,'function weaponSkillId(','function characterWeaponFv('),
 section(legacy,'function expertSkillSpecialMax(','function skillRollContextLine(')
])
undo=section((ROOT/'src/main.js').read_text(),'const COMBAT_UNDO_CURRENT_KEY=','const combatUndoBody=')
HARNESS='''<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SISYPHUS local integration</title><link rel="stylesheet" href="/src/styles/app.css"><link rel="stylesheet" href="/features/combat/two-weapons.css">
<body><main id="combatPage"><h1>SISYPHUS · lokalt integrationsprov</h1><div id="panel"></div>
<button class="btn" id="roll">Slå vald attack</button><button class="btn" id="end">Avsluta drag</button><button class="btn" id="parry">Parera inkommande attack</button><p id="error"></p></main>
<script src="/src/features/combat/hand-rules.js"></script><script>
var activeCombat=null,combatants=[],combatActions=[],combatLogRows=[],chars=[],ruleWeapons=[],ruleSkills=[],ruleSpells=[],centralCampaignRole='gm',centralCampaignId='',supabaseSession={user:{id:'fixture'}},player=false;
function $(id){return document.getElementById(id)}
function escAttr(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function activeUser(){return {id:'fixture',admin:!player}}
function ruleWeaponForItem(){return null}
window.alert=message=>{$('error').textContent=message};
''' +helpers+'''</script><script src="/features/combat/runtime.js"></script><script>'''+undo+'''</script><script>
player=new URLSearchParams(location.search).get('role')==='player';centralCampaignRole=player?'player':'gm';
async function dbJson(path,options={}){
 const response=await fetch('/__sisyphus/db/'+path,{...options,headers:{...options.headers,'Content-Type':'application/json','X-Fixture-Role':player?'player':'gm'}});
 const data=await response.json();if(!response.ok)throw Error(data.error||'fixture transport error');return data;
}
loadActiveCombat=async function(){
 const response=await fetch('/__sisyphus/state',{headers:{'X-Fixture-Role':player?'player':'gm'}}),state=await response.json();
 activeCombat=state.instance;combatants=state.actors;combatActions=state.actions;combatLogRows=state.logs;chars=state.characters;centralCampaignId=activeCombat.campaign_id;renderCombat();return activeCombat;
};
renderCombat=function(){
 const actor=combatActiveActor();$('panel').innerHTML=actor?combatTwoWeaponsHtml(actor):'<p>Ny SR · nytt initiativ</p>';
 $('roll').disabled=player||!actor||combatChosenAction(actor)?.status!=='planned';
 $('end').disabled=player||!actor;
 $('parry').disabled=player||!combatPendingParryOpportunity();
};
combatPossibleAttackTargets=(actor,mode,weapon)=>new Map(combatants.filter(c=>c.id!==actor.id).map(c=>[c.id,{mode:'melee',distance:1}]));
combatRollDice=async(specs)=>({rolls:specs.flatMap(s=>Array.from({length:s.qty},()=>({value:s.sides===20?10:Math.min(s.sides,3)})))});
combatResolveHitLocation=async()=>({key:'chest',label:'Bröst'});
combatAwardAttackErf=async()=>null;combatStartMeleeFx=()=>null;combatTickAreaStay=async()=>{};combatTickOngoingEffects=async()=>{};
combatRollAndApplyInitiative=async()=>{};
$('roll').onclick=()=>{const actor=combatActiveActor(),target=combatants.find(c=>c.id!==actor.id);return rollCombatAttack(actor.id,target.id)};
$('end').onclick=()=>endCombatTurn(null,activeCombat.active_actor_id);
$('parry').onclick=()=>{const p=combatPendingParryOpportunity();return chooseCombatParry(p.defender.id,p.attack.id,p.options[0].key)};
window.ready=loadActiveCombat();
</script></body></html>'''


class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*_): pass
 def response(self,value,status=200):
  payload=json.dumps(value,default=str).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(payload)
 def do_GET(self):
  parsed=urlparse(self.path)
  if parsed.path=='/__sisyphus/':
   self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(HARNESS.encode());return
  if parsed.path=='/__sisyphus/state':
   player=self.headers.get('X-Fixture-Role')=='player'
   self.response({'instance':execute('select * from combat_instances where id=%s',(FIXTURE['combat'],),player)[0],
    'actors':execute('select * from combatants where combat_id=%s order by name_snapshot',(FIXTURE['combat'],),player),
    'actions':execute('select * from combat_actions where combat_id=%s order by round_number,sequence,created_at',(FIXTURE['combat'],),player),
    'logs':execute('select * from combat_log where combat_id=%s order by id desc limit 60',(FIXTURE['combat'],),player),
    'characters':[dict(r['data'],_dbId=r['id']) for r in execute('select id,data from characters',player=player)]});return
  if parsed.path.startswith('/__sisyphus/db/'):return self.database('GET')
  super().do_GET()
 def do_PATCH(self):return self.database('PATCH')
 def do_POST(self):return self.database('POST')
 def do_DELETE(self):return self.database('DELETE')
 def database(self,method):
  try:
   parsed=urlparse(self.path);path=parsed.path.removeprefix('/__sisyphus/db/');query=parse_qs(parsed.query)
   length=int(self.headers.get('Content-Length',0));body=json.loads(self.rfile.read(length)) if length else None
   player=self.headers.get('X-Fixture-Role')=='player';args=[]
   if path.startswith('rpc/'):
    name=path[4:];assert name in RPCS
    statement=sql.SQL('select public.{}({}) as value').format(sql.Identifier(name),sql.SQL(',').join(sql.SQL('{} => %s').format(sql.Identifier(k)) for k in body))
    result=execute(statement,[Json(v) if isinstance(v,(dict,list)) else v for v in body.values()],player);self.response(result[0]['value']);return
   if path in {'combat_area_effects','combat_area_events'}:self.response([]);return
   assert path in TABLES
   filters=[]
   for key,values in query.items():
    if key in {'select','order','limit'}:continue
    op,_,value=values[0].partition('.')
    if op=='eq':filters.append(sql.SQL('{}=%s').format(sql.Identifier(key)));args.append(value)
    elif op=='in':filters.append(sql.SQL('{}=any(%s)').format(sql.Identifier(key)));args.append(value.strip('()').split(','))
    elif op=='gte':filters.append(sql.SQL('{}>=%s').format(sql.Identifier(key)));args.append(value)
    elif op=='gt':filters.append(sql.SQL('{}>%s').format(sql.Identifier(key)));args.append(value)
    else:raise ValueError('Unsupported fixture filter')
   where=sql.SQL(' where ')+sql.SQL(' and ').join(filters) if filters else sql.SQL('')
   if method=='GET':statement=sql.SQL('select * from {}').format(sql.Identifier(path))+where
   elif method=='PATCH':
    columns=sql.SQL(',').join(sql.SQL('{}=%s').format(sql.Identifier(k)) for k in body)
    statement=sql.SQL('update {} set ').format(sql.Identifier(path))+columns+where+sql.SQL(' returning *')
    args=[Json(v) if isinstance(v,(dict,list)) else v for v in body.values()]+args
   elif method=='POST':
    statement=sql.SQL('insert into {} ({}) values ({}) returning *').format(sql.Identifier(path),sql.SQL(',').join(map(sql.Identifier,body)),sql.SQL(',').join(sql.Placeholder() for _ in body))
    args=[Json(v) if isinstance(v,(dict,list)) else v for v in body.values()]
   else:statement=sql.SQL('delete from {}').format(sql.Identifier(path))+where+sql.SQL(' returning *')
   self.response(execute(statement,args,player))
  except Exception as error:self.response({'error':str(error)},409)


def fresh():
 execute("update combat_instances set round_number=round_number+1,phase='movement',active_actor_id=%s where id=%s",(FIXTURE['actor'],FIXTURE['combat']))
 execute("update combatants set movement_remaining=10,current_kp=100,status='active',state=state-'equipment_override'-'broken_weapon_keys'-'dropped_weapon_keys' where id=any(%s::uuid[])",([FIXTURE['actor'],FIXTURE['target']],))
 execute("update combatants set state=state||'{\"dropped_weapon_keys\":[\"sword\",\"dagger\"]}' where id=%s",(FIXTURE['target'],))


def incoming():
 aid=str(uuid.uuid4())
 execute("insert into combat_actions(id,combat_id,campaign_id,combatant_id,round_number,phase,action_type,slot_key,status,target_combatant_id,result) select %s,id,campaign_id,%s,round_number,'normal','attack','', 'resolved',%s,%s from combat_instances where id=%s",
  (aid,FIXTURE['target'],FIXTURE['actor'],Json({'success':True,'awaiting_parry':True,'weapon_name':'Dolk','attack_mode':'melee'}),FIXTURE['combat']))
 return aid


http=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)))
Thread(target=http.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{http.server_port}/__sisyphus/'
checks=[];errors=[]
with sync_playwright() as playwright:
 browser=playwright.chromium.launch(executable_path=os.environ.get('CHROME_BIN') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1200,'height':1100});page.on('pageerror',lambda error:errors.append(str(error)))
 def load():page.goto(url);page.evaluate('window.ready');page.locator('#error').evaluate('(e)=>e.textContent=""')
 fresh();load()
 page.get_by_role('button',name='Attack + Attack',exact=True).click()
 page.wait_for_function('combatActions.filter(a=>a.round_number===activeCombat.round_number).length===2')
 page.locator('#roll').click();page.wait_for_function('combatActions.some(a=>a.round_number===activeCombat.round_number&&a.slot_key==="primary"&&a.status==="resolved")')
 assert not page.locator('#error').inner_text(),page.locator('#error').inner_text()
 page.locator('#end').click();page.wait_for_function('activeCombat.active_actor_id!=='+json.dumps(FIXTURE['actor']))
 page.locator('#end').click();page.wait_for_function('activeCombat.phase==="late"')
 checks.append('Chromium enters late pass after all ordinary turns')
 page.locator('#roll').click();page.wait_for_function('combatActions.some(a=>a.round_number===activeCombat.round_number&&a.slot_key==="secondary"&&a.status==="resolved")')
 results=page.evaluate('combatActions.filter(a=>a.round_number===activeCombat.round_number).map(a=>({hand:a.result.hand,damage:a.result.damage?.net_damage,status:a.status}))')
 assert len(results)==2 and {r['hand'] for r in results}=={'rightHand','leftHand'} and all(r['damage']>0 for r in results)
 checks.append('two distinct attacks have separate dice, FV, hand and actual damage')
 before=page.evaluate('combatants.find(c=>c.id==='+json.dumps(FIXTURE['target'])+').current_kp')
 page.evaluate('window.confirm=()=>true;window.undoLastCombatTurn()')
 own=page.evaluate('combatActions.filter(a=>a.round_number===activeCombat.round_number&&a.combatant_id==='+json.dumps(FIXTURE['actor'])+')')
 assert {a['slot_key']:a['status'] for a in own}=={'primary':'resolved','secondary':'planned'}
 assert page.evaluate('combatants.find(c=>c.id==='+json.dumps(FIXTURE['target'])+').current_kp')>before
 checks.append('undo of second attack preserves first attack and restores only its own damage/slot')
 page.locator('#roll').click();page.wait_for_function('combatActions.some(a=>a.round_number===activeCombat.round_number&&a.slot_key==="secondary"&&a.status==="resolved")')
 page.reload();page.evaluate('window.ready');assert page.get_by_text('Förbrukad',exact=False).count()>0
 checks.append('browser reload preserves consumed actions')

 for mode,label,parries in [('attack_parry','Attack + Parering',1),('parry_parry','Parering + Parering',2)]:
  fresh();load();page.get_by_role('button',name=label,exact=True).click()
  page.wait_for_function('combatActions.some(a=>a.round_number===activeCombat.round_number&&a.source_data?.combination_mode==='+json.dumps(mode)+')')
  if mode=='attack_parry':
   page.locator('#roll').click();page.wait_for_function('combatActions.some(a=>a.round_number===activeCombat.round_number&&a.slot_key==="primary"&&a.status==="resolved")')
  ids=[]
  for n in range(parries):
   ids.append(incoming());page.evaluate('loadActiveCombat()');page.locator('#parry').click()
   page.wait_for_function('(n)=>combatActions.filter(a=>a.round_number===activeCombat.round_number&&a.combatant_id==='+json.dumps(FIXTURE['actor'])+'&&a.action_type==="parry"&&a.status==="resolved").length===n',arg=n+1)
  own=page.evaluate('combatActions.filter(a=>a.round_number===activeCombat.round_number&&a.combatant_id==='+json.dumps(FIXTURE['actor'])+')')
  assert len(own)==2 and all(a['status']=='resolved' for a in own)
  assert {a['result']['reaction_to_action_id'] for a in own if a['action_type']=='parry'}==set(ids)
  checks.append(label+' uses independent persisted hands/reaction IDs')
  if parries==2:
   page.evaluate('window.confirm=()=>true;window.undoLastCombatTurn()')
   own=page.evaluate('combatActions.filter(a=>a.round_number===activeCombat.round_number&&a.combatant_id==='+json.dumps(FIXTURE['actor'])+')')
   assert {a['slot_key']:a['status'] for a in own}=={'primary':'resolved','secondary':'reserved'}
   checks.append('undo of second parry preserves first parry and reopens the correct incoming attack')

 # Actual player polling follows updated_at after a GM plan, with no action write controls.
 fresh();load();viewer=browser.new_page(viewport={'width':390,'height':844});viewer.goto(url+'?role=player');viewer.evaluate('window.ready')
 page.get_by_role('button',name='Parering + Parering',exact=True).click()
 page.wait_for_function('combatActions.some(a=>a.round_number===activeCombat.round_number&&a.status==="reserved")')
 viewer.evaluate('combatPollPlayerView()')
 assert viewer.get_by_text('Parering reserverad',exact=False).count()>0
 assert viewer.get_by_role('button',name='Attack + Attack',exact=True).is_disabled()
 assert viewer.evaluate('document.documentElement.scrollWidth<=innerWidth')
 checks.append('player poll sees reserved slots and stays within 390px viewport')
 page.screenshot(path=str(WORK/'sisyphus-desktop.png'),full_page=True)
 viewer.screenshot(path=str(WORK/'sisyphus-mobile.png'),full_page=True)
 assert not errors,errors
 assert not page.locator('#error').inner_text(),page.locator('#error').inner_text()
 checks.append('no browser JavaScript errors')
 browser.close()
http.shutdown()
print(json.dumps({'passed':len(checks),'failed':0,'checks':checks},ensure_ascii=False,indent=2))
