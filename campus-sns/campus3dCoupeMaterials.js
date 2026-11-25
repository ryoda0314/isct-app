// Normals and eye vectors are in east/north/up metres. Keep the photographic
// reflection fixed in the world as the body and camera turn independently.
export const COUPE_VERTEX = `#version 300 es
precision highp float;
in vec3 a_position, a_normal, a_surface;
in vec4 a_paint;
in vec2 a_uv;
uniform mat4 u_clip;
uniform mat3 u_body, u_part;
uniform vec3 u_shift, u_eye;
uniform vec4 u_dents;
out vec3 v_normal, v_view, v_base;
out vec4 v_finish;
out vec2 v_uv;
out float v_damage;

vec3 crushed(vec3 p, out float strain) {
  float side=clamp(.5+.67*p.y,0.,1.);
  float end=p.x>0.?mix(u_dents.y,u_dents.x,side):mix(u_dents.w,u_dents.z,side);
  float nose=end*pow(clamp((abs(p.x)-1.02)/1.12,0.,1.),1.45);
  float door=mix(min(u_dents.y,u_dents.w),min(u_dents.x,u_dents.z),side)
    *smoothstep(.52,.81,abs(p.y))*max(0.,1.-p.x*p.x/3.61);
  strain=max(nose,door);
  return p+vec3(-sign(p.x)*nose*(.43+.11*cos(p.y*7.)),
    -sign(p.y)*(nose*.09+door*(.17+.06*sin(6.*p.x+3.*p.z))),
    nose*(.065+.12*sin(abs(p.x)*12.+p.y*4.))*(p.z>.46?1.:-.4));
}
void main() {
  vec3 p=a_position/8192., n=normalize(a_normal);
  v_damage=0.;
  if(dot(u_dents,vec4(1.))>.001){
    vec3 t=normalize(cross(n,abs(n.z)<.9?vec3(0.,0.,1.):vec3(0.,1.,0.)));
    vec3 b=cross(n,t); float ignore;
    vec3 moved=crushed(p,v_damage);
    n=normalize(cross(crushed(p+.009*t,ignore)-moved,crushed(p+.009*b,ignore)-moved));
    p=moved;
  }
  vec3 world=u_body*(u_part*p+u_shift);
  gl_Position=u_clip*vec4(world,1.);
  v_normal=u_body*u_part*n;
  v_view=u_eye-world;
  v_base=a_paint.rgb;
  v_finish=vec4(a_surface.x,a_surface.y/255.,a_surface.z/255.,a_paint.a);
  v_uv=a_uv/4096.;
}`;

export const COUPE_FRAGMENT = `#version 300 es
precision highp float;
in vec3 v_normal, v_view, v_base;
in vec4 v_finish;
in vec2 v_uv;
in float v_damage;
out vec4 fragColor;
uniform sampler2D u_env, u_surfaceMap, u_instruments;
uniform vec3 u_sun, u_light;
uniform vec4 u_lamps; // daylight, headlights, brake, reverse
const float PI=3.14159265;
vec3 surfaceLight(vec3 dir,float rough) {
  vec2 uv=vec2(atan(dir.y,dir.x)/(2.*PI)+.5,acos(clamp(dir.z,-1.,1.))/PI);
  vec3 photo=textureLod(u_env,uv,.35+6.8*rough).rgb;
  vec3 radiance=photo*photo/(1.-.74*photo);
  return radiance*mix(.055,.96,u_lamps.x)*mix(vec3(.62,.74,1.),u_light,u_lamps.x);
}
vec3 detailNormal(vec3 n,vec2 tiled,vec2 tile,float amount){
  // Gradients are evaluated before wrapping. This avoids a dark mip seam
  // at every repeat of the tread or leather grain.
  vec2 dx=dFdx(tiled),dy=dFdy(tiled);
  vec2 atlas=tile+.5*mix(vec2(.009),vec2(.991),fract(tiled));
  vec2 bump=textureGrad(u_surfaceMap,atlas,.5*dx,.5*dy).rg*2.-1.;
  vec3 a=dFdx(-v_view),b=dFdy(-v_view);
  vec3 ta=cross(b,n)*dx.x+cross(n,a)*dy.x;
  vec3 bi=cross(b,n)*dx.y+cross(n,a)*dy.y;
  return normalize(n+amount*(ta*bump.x+bi*bump.y)*inversesqrt(max(1e-16,max(dot(ta,ta),dot(bi,bi)))));
}
vec3 displayColor(vec3 x){
  x=max(x,vec3(0.));
  return sqrt(clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.));
}
void main(){
  float id=floor(v_finish.x+.5), ao=v_finish.y, rough=v_finish.z, metal=v_finish.w;
  vec3 n=normalize(v_normal), eye=normalize(v_view), base=v_base*v_base;
  if(id==1. && dot(n,eye)<0.) discard;
  if(dot(n,eye)<0.) n=-n;
  if(id==19.) n=detailNormal(n,v_uv*vec2(1.,4.)+vec2(0.,1.5),vec2(0.),.8);
  if(id==3.||id==6.) n=detailNormal(n,v_uv*vec2(105.,210.),vec2(.5,0.),.23);
  if(id==7.) n=detailNormal(n,v_uv*46.,vec2(0.,.5),.28);
  if(id==17.) n=detailNormal(n,v_uv*vec2(20.,10.),vec2(.5),.62);
  vec3 r=reflect(-eye,n), l=normalize(u_sun), h=normalize(l+eye);
  float nv=max(.001,dot(n,eye)), nl=max(0.,dot(n,l)), nh=max(0.,dot(n,h));
  float fres=pow(1.-nv,5.), daylight=u_lamps.x;
  if(id==1.) {
    float alpha=.12+.64*fres+.075*(1.-daylight);
    vec3 reflection=surfaceLight(r,.045);
    vec3 glazing=displayColor(mix(vec3(.024,.054,.065)*(.24+.76*daylight),reflection,.53+.37*fres));
    fragColor=vec4(glazing*alpha,alpha);return;
  }
  if(id==8. || id==9.){
    vec2 st=clamp(v_uv,0.,1.);
    st.y=(id==8.?0.:.5)+st.y*.5;
    vec3 ink=texture(u_instruments,st).rgb;
    if(id==8.){fragColor=vec4(ink*(.85+.15*daylight),1.);return;}
    base=ink*ink;
  }
  float a=max(.026,rough*rough), d=nh*nh*(a*a-1.)+1.;
  float distribution=a*a/(PI*d*d);
  float k=(rough+1.)*(rough+1.)*.125;
  float visibility=.25/(max(.001,nv*(1.-k)+k)*max(.001,nl*(1.-k)+k));
  vec3 f0=mix(vec3(.045),base,metal);
  vec3 fs=f0+(1.-f0)*pow(1.-max(0.,dot(eye,h)),5.);
  vec3 ibl=surfaceLight(r,rough), reflected=f0+(max(vec3(1.-rough),f0)-f0)*fres;
  float hemi=.34+.34*(.5+.5*n.z);
  vec3 diffuse=base*(1.-.68*metal)*((.11+.89*daylight)*hemi+.85*daylight*nl)*u_light;
  vec3 col=diffuse*(.30+.70*ao)+ibl*reflected*(.65+.35*ao)*(1.-.82*rough)
    +u_light*min(vec3(1.8),fs*(distribution*visibility*nl))*(.08+.87*daylight);
  if(id==11. || id==10. || id==16.){
    vec3 coat=surfaceLight(r,.075);
    col=col*(1.-.14*fres)+coat*(.048+.43*fres);
    col+=u_light*pow(max(0.,dot(r,l)),125.)*.6*daylight;
  }
  if(id==13.) col+=vec3(1.,.009,.003)*(.12+.16*u_lamps.y+1.8*u_lamps.z);
  if(id==14.) col+=vec3(.82,.91,1.)*(.18+1.65*u_lamps.y);
  if(id==12.) col+=vec3(.86,.92,1.)*u_lamps.w;
  col*=1.-.28*v_damage;
  fragColor=vec4(displayColor(col),1.);
}`;

// Both faces use the original mesh UVs. Only regenerate the dashboard when
// a displayed value changes. Other people's cars never override the driver's readout.
export function instrumentCanvas() {
  const canvas=document.createElement("canvas");
  canvas.width=512; canvas.height=256;
  const ctx=canvas.getContext("2d");
  ctx.fillStyle="#e5e7d9";ctx.fillRect(0,128,512,128);
  ctx.strokeStyle="#a7ab9e";ctx.lineWidth=5;ctx.strokeRect(5,133,502,118);
  ctx.fillStyle="#26413d";ctx.textAlign="center";
  ctx.font="bold 26px sans-serif";ctx.fillText("大 岡 山   3 0 0",256,165);
  ctx.font="bold 80px monospace";ctx.fillText("20-24",256,239);
  let stateKey;
  return {canvas, update(speed=0,gear=1,rpm=1100){
    const kmh=Math.round(Math.abs(speed)*3.6), led=Math.round(Math.min(1,rpm/7400)*23);
    const key=[kmh,gear,led].join("/");
    if(key===stateKey) return false;
    stateKey=key;
    ctx.fillStyle="#0b1113";ctx.fillRect(0,0,512,128);
    ctx.fillStyle="#374247";ctx.fillRect(32,23,448,2);
    for(let i=0;i<23;i++){
      ctx.fillStyle=i<led ? (i>18?"#fd7155":"#a7d8cf") : "#233136";
      ctx.fillRect(35+i*19,10,15,7);
    }
    ctx.fillStyle="#d6dfd8";ctx.textAlign="right";
    ctx.font="bold 74px monospace";ctx.fillText(String(kmh),287,96);
    ctx.textAlign="left";ctx.font="15px sans-serif";ctx.fillText("km/h",300,95);
    ctx.fillStyle="#e69b70";ctx.font="bold 37px monospace";ctx.fillText(gear<0?"R":String(gear||"N"),76,82);
    ctx.fillStyle="#8da39f";ctx.font="12px sans-serif";ctx.fillText("GEAR",71,103);ctx.fillText("RPM × 1000",369,51);
    return true;
  }};
}
