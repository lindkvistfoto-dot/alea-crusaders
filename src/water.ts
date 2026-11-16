import {Filter, defaultFilterVert} from 'pixi.js';
export const effects = {water: {name:'Flowing Water', create: () => Filter.from({
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
 out vec4 finalColor;
 void main(){
 vec2 p=vTextureCoord*uInputSize.xy/max(uZoom,0.001);
 vec2 flow=vec2(cos(uDirection),sin(uDirection));
 vec2 normal=vec2(-flow.y,flow.x);
 float t=uTime*uSpeed;
 float a=dot(p,flow), b=dot(p,normal);
 float wave=sin(b*.075-a*.024+t*2.6)*.6+sin(b*.13+a*.035-t*3.8)*.4;
 vec2 offset=(normal*wave+flow*sin(a*.05-t*2.2)*.45)*uStrength*uZoom*uInputSize.zw;
 vec4 col=texture(uTexture,clamp(vTextureCoord+offset,uInputClamp.xy,uInputClamp.zw));
 float glint=pow(max(0.,sin(b*.15-a*.03+t*2.6)),18.)*.07*min(uStrength/8.,1.);
 finalColor=vec4(col.rgb+vec3(.4,.7,1.)*glint*col.a,col.a);
 }`},resources:{waterUniforms:{uTime:{value:0,type:'f32'},uSpeed:{value:1,type:'f32'},uStrength:{value:8,type:'f32'},uDirection:{value:1.57,type:'f32'},uZoom:{value:1,type:'f32'}}}
})}};
