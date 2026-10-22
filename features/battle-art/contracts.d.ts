/** BENGALI v1. Client delivery types; future DB writers must enforce typed FKs and RLS separately. */
declare namespace AleaBattleArt {
 type OwnerField = 'characterId'|'campaignNpcId'|'campaignMonsterId'|'globalNpcId'|'combatantId';
 type Owner = {[K in OwnerField]: Record<K,string> & Partial<Record<Exclude<OwnerField,K>,never>>}[OwnerField];
 type Facing = 0|1|2|3|4|5;
 type View = 'front'|'right'|'left';
 type Shape = 'single'|'line2'|'triangle3'|'line3'|'giant7';
 type Posture = 'standing'|'mounted';
 type Category = 'melee'|'projectile'|'thrown';
 type Grip = 'one_hand'|'two_hands';
 interface OwnerDescriptor {
  owner:Owner;key:string;actorKind:'character'|'npc'|'enemy'|'monster'|'combatant';
  campaignId:string|null;sourceGlobalNpcId:string|null;combatantId?:string;
 }
 interface Hand {
  kind:'empty'|'weapon'|'shield'|'equipment'|'unknown';instanceId?:string;
  masterId?:string|null;category?:Category;grip?:Grip;reason?:string;
 }
 interface Loadout {
  contractVersion:1;hands:{rightHand:Hand;leftHand:Hand};weapons:Hand[];
  shieldHands:('rightHand'|'leftHand')[];unarmed:boolean;known:boolean;
  warnings:string[];assumedLegacyHands:boolean;signature:string;
 }
 interface HandCondition {
  kind:'empty'|'weapon'|'shield'|'equipment';masterId?:string|null;
  instanceId?:string;allowedMasterIds?:string[];category?:Category;grip?:Grip;
 }
 interface Layout {
  profile:string;shape:Shape;facing:Facing|null;anchor:{x:number;y:number};
  groundWidthPx:number;groundWidthHex:number;scale:number;
 }
 interface Asset {
  id:string;status:'draft'|'verified'|'active'|'experimental';verified:boolean;
  bucket:'campaign-actor-images'|'alea-hermes-public';path:string;
  app_sha256:string;app_bytes:number;width:number;height:number;
  alpha_preserved:boolean;layouts:Layout[];
 }
 interface Slot {
  id:string;kind:'battle_pose'|'cutout';role:'specific'|'general';
  status:'draft'|'verified'|'active'|'experimental';verified:boolean;reviewed:boolean;
  posture:Posture;view:View;facing?:Facing|null;
  supportedFacings:Facing[];fallbackFacings:Facing[];
  mountProfile?:string;mountCombatantId?:string;
  loadouts?:{rightHand:HandCondition;leftHand:HandCondition}[];
  equipmentNeutral?:boolean;assetId:string;baseMode:'embedded'|'shared';shadowMode:'baked'|'shared';
 }
 interface Manifest {
  contractVersion:1;setId:string;versionId:string;revision:number;status:'active';
  owner:Owner;campaignId:string|null;combatantId:string;accessKey:string;
  slots:Slot[];assets:Asset[];
  portrait?:{assetId:string;reviewed:boolean;equipmentNeutral:boolean};
  systemArt?:{'arcane-portrait-stand'?:string;'arcane-paper-doll-hexagon-base'?:string};
 }
 interface Request {
  owner:Owner;combatantId:string;campaignId:string|null;accessKey:string;visible:boolean;
  loadout:Loadout;manifest:Manifest|null;facing?:Facing|null;view?:View;shape?:Shape;layoutProfile?:string;
  posture:Posture;mountProfile?:string;mountCombatantId?:string;mountRevision?:number;
  unavailableAssetIds?:string[];
 }
 interface Flags {battlePoses:boolean}
 interface Selection {
  kind:'disabled'|'battle_pose'|'cutout'|'portrait'|'initials'|'marker'|'stale';
  reason:string;tier?:1|2|3|4|5;key?:string;mirror?:false;mounted?:boolean;
  slotId?:string;asset?:Omit<Asset,'status'|'verified'|'alpha_preserved'|'layouts'>|null;
  stand?:Selection['asset'];base?:Selection['asset'];transform?:Omit<Layout,'shape'|'facing'>;
  directionApproximate?:boolean;versionId?:string;revision?:number;urls?:Record<string,string>;
 }
 function readOwner(type:string,record:object):OwnerDescriptor|null;
 function readCombatantOwner(combatant:object,sources?:object):OwnerDescriptor|null;
 function readWeaponRegister(rows:object[]):object[];
 function readBattleLoadout(profile:object|null,state?:object,options?:object):Loadout;
 function readCombatantLoadout(combatant:object,adapters:object):Loadout;
 function readRegistryLoadout(type:string,record:object,adapters?:object):Loadout;
 function resolveBattleArt(request:Request,flags?:Flags):Selection;
 function requestKey(request:Request):string;
 function createDeliverySession(options?:{
  flags?:Flags;loadAsset?:(asset:NonNullable<Selection['asset']>)=>Promise<string>;
  onChange?:(result:Selection)=>void;
 }):{select(request:Request):Promise<Selection>;clear():Selection};
 function readHermesCandidate(metadata:object,binding:object):Asset|null;
}
