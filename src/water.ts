import {Filter, defaultFilterVert} from 'pixi.js';
function createWaterEffect(kind:number){ return Filter.from({
 gl:{vertex:defaultFilterVert,fragment:`
 precision highp float;
 in vec2 vTextureCoord;
 uniform sampler2D uTexture;
 uniform vec4 uInputSize;
 uniform vec4 uInputClamp;
 uniform float uTime;
 uniform float uSpeed;
 uniform float uStrength;
 uniform float uDirection;
 uniform float uZoom;
 uniform float uKind;
 out vec4 finalColor;
 void main(){
 vec2 p=vTextureCoord*uInputSize.xy/max(uZoom,0.001);
 vec2 flow=vec2(cos(uDirection),sin(uDirection));
 vec2 normal=vec2(-flow.y,flow.x);
 float t=uTime*uSpeed;
 float a=dot(p,flow), b=dot(p,normal);
 float wave=sin(b*.075-a*.024+t*2.6)*.6+sin(b*.13+a*.035-t*3.8)*.4;
 vec2 offset=(normal*wave+flow*sin(a*.05-t*2.2)*.45)*uStrength*uZoom*uInputSize.zw;
 float light=0.;
 float foam=0.;
 float power=min(uStrength/12.,2.);
 if(uKind==1.) { // Gentle refraction: broad, smooth surface distortion
 offset=vec2(sin(p.y*.035+t*1.3),cos(p.x*.041-t*.9))*uStrength*.65*uZoom*uInputSize.zw;
 }
 if(uKind==2.) { // Concentric ripples with several stationary sources
 vec2 center=floor(p/180.)*180.+vec2(90.);
 vec2 delta=p-center;float d=length(delta);
 float ring=sin(d*.18-t*4.);
 offset=normalize(delta+vec2(.001))*ring*uStrength*.65*uZoom*uInputSize.zw;
 light=pow(max(0.,ring),16.)*.10*power;
 }
 if(uKind==3.) { // Interference caustics on the original map
 float c=sin(a*.065+sin(b*.043+t*.8)*2.+t)+sin(b*.084+sin(a*.038-t)*2.-t*.7);
 light=pow(max(0.,1.-abs(c)*.65),12.)*.30*power;
 offset*=.35;
 }
 if(uKind==4.) { // Travelling wave fronts
 float crest=sin(a*.065-t*3.+sin(b*.025)*1.4);
 offset=flow*crest*uStrength*uZoom*uInputSize.zw;
 light=pow(max(0.,crest),20.)*.22*power;
 }
 if(uKind==5.) { // Animated foam flecks flowing in the selected direction
 vec2 q=vec2(a-t*22.,b);vec2 cell=floor(q/18.);vec2 f=fract(q/18.)-.5;
 float seed=fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);
 foam=(1.-smoothstep(.08,.24,length(f)))*step(.72,seed)*(.6+.4*sin(t*2.+seed*30.))*min(power,1.);
 offset*=.5;
 }
 if(uKind==6.) { // Rain impacts: staggered rings per cell
 vec2 cell=floor(p/65.);vec2 f=fract(p/65.)-.5;
 float seed=fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);
 float phase=fract(t*.7+seed);float d=length(f);
 float ring=exp(-pow((d-phase*.64)*45.,2.))*(1.-phase);
 offset=normalize(f+vec2(.001))*ring*uStrength*.5*uZoom*uInputSize.zw;
 light=ring*.3*power;
 }
 if(uKind==7.) { // Fast waterfall streaks
 float streak=pow(max(0.,sin(b*.35+sin(b*.12)*2.)),8.);
 float pulse=.5+.5*sin(a*.11-t*9.+sin(b*.13));
 offset=(flow*sin(a*.12-t*9.)+normal*sin(b*.2-t))*uStrength*uZoom*uInputSize.zw;
 foam=streak*pulse*.45*min(power,1.);
 light=streak*.10*power;
 }
 vec4 col=texture(uTexture,clamp(vTextureCoord+offset,uInputClamp.xy,uInputClamp.zw));
 float glint=pow(max(0.,sin(b*.15-a*.03+t*2.6)),18.)*.07*min(uStrength/8.,1.);
 if(uKind!=0.)glint=0.;
 vec3 color=col.rgb+vec3(.4,.7,1.)*(glint+light)*col.a;
 color=mix(color,vec3(.86,.96,1.)*col.a,foam);
 finalColor=vec4(color,col.a);
 }`},resources:{waterUniforms:{uKind:{value:kind,type:'f32'},uTime:{value:0,type:'f32'},uSpeed:{value:1,type:'f32'},uStrength:{value:8,type:'f32'},uDirection:{value:1.57,type:'f32'},uZoom:{value:1,type:'f32'}}}
});}
export const effects = {
 water: {name:'Flowing Water · Strömmande vatten', create:()=>createWaterEffect(0)},
 refraction: {name:'Refraction · Vattenbrytning', create:()=>createWaterEffect(1)},
 ripples: {name:'Ripples · Ringar på vattnet', create:()=>createWaterEffect(2)},
 caustics: {name:'Caustics · Ljusspel', create:()=>createWaterEffect(3)},
 waves: {name:'Waves · Vågor', create:()=>createWaterEffect(4)},
 foam: {name:'Foam · Skum', create:()=>createWaterEffect(5)},
 rain: {name:'Rain · Regnringar', create:()=>createWaterEffect(6)},
 waterfall: {name:'Waterfall · Vattenfall', create:()=>createWaterEffect(7)}
};
export type EffectId=keyof typeof effects;

