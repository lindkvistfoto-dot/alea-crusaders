export type Point={x:number;y:number};
export const lightTypes={torch:'Fackla',fireplace:'Eldstad',lantern:'Lykta',sun:'Solljus',moon:'Månsken'} as const;
export type LightKind=keyof typeof lightTypes;
export type Ambient={enabled:boolean;darkness:number;color:string};
export type Light={id:number;kind:LightKind;x:number;y:number;radius:number;intensity:number;flicker:number;color:string;direction:number;spread:number;ellipse:number;enabled:boolean;animated:boolean;time:number;polygon:Point[]};
export type LightingState={ambient:Ambient;lights:Light[]};
export const defaultAmbient=():Ambient=>({enabled:true,darkness:63,color:'#091426'});
export function isBeam(kind:LightKind){return kind==='sun'||kind==='moon';}
export function makeLight(kind:LightKind,id:number,p:Point):Light{return{id,kind,...p,radius:180,intensity:100,flicker:35,color:({torch:'#ffb34d',fireplace:'#ff8038',lantern:'#ffe1a0',sun:'#fff0c4',moon:'#9ecaff'})[kind],direction:0,spread:55,ellipse:kind==='fireplace'?0.65:1,enabled:true,animated:true,time:0,polygon:[]};}
function hash(n:number){const x=Math.sin(n*127.1+311.7)*43758.5453123;return x-Math.floor(x);}
function noise(t:number,seed:number){const i=Math.floor(t),f=t-i,u=f*f*(3-2*f);return hash(i+seed)*(1-u)+hash(i+1+seed)*u;}
export function lightPulse(l:Light){if(isBeam(l.kind))return{brightness:1,reach:1};const amount=l.flicker/100*(l.kind==='lantern'?.14:l.kind==='fireplace'?1.05:.7);const n=(noise(l.time*7,l.id*19)*.55+noise(l.time*17,l.id*37)*.3+noise(l.time*2.3,l.id*67)*.15)*2-1;return{brightness:1+n*amount,reach:1+n*amount*.12};}
const color=(v:unknown)=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v);
export function validateLighting(v:unknown):v is LightingState{const s=v as LightingState;return !!s&&!!s.ambient&&typeof s.ambient.enabled==='boolean'&&num(s.ambient.darkness)&&s.ambient.darkness>=0&&s.ambient.darkness<=100&&color(s.ambient.color)&&Array.isArray(s.lights)&&new Set(s.lights.map(l=>l.id)).size===s.lights.length&&s.lights.every(l=>Object.hasOwn(lightTypes,l.kind)&&color(l.color)&&[l.id,l.x,l.y,l.radius,l.intensity,l.flicker,l.direction,l.spread,l.ellipse,l.time].every(num)&&l.radius>0&&l.intensity>=0&&l.intensity<=200&&l.flicker>=0&&l.flicker<=100&&l.spread>=5&&l.spread<=150&&l.ellipse>=.1&&l.ellipse<=3&&typeof l.enabled==='boolean'&&typeof l.animated==='boolean'&&Array.isArray(l.polygon)&&(l.polygon.length===0||l.polygon.length>=3)&&l.polygon.every(p=>num(p.x)&&num(p.y)));}
