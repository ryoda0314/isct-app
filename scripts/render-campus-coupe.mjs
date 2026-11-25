// Render the garage card with the same indexed mesh, materials and lighting
// pipeline as the drivable car. The temporary server serves only these assets.
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer";
import sharp from "sharp";
import { compile } from "../campus-sns/campus3dLayer.js";

export async function renderCoupeCard(destination) {
  const modules=["campus3dCoupeRenderer","campus3dVehicleGeometry","campus3dCoupeMaterials"];
  const files=new Map(modules.map(n=>["/"+n+".js",new URL("../campus-sns/"+n+".js",import.meta.url)]));
  for(const name of ["coupe-v1.bin","courtyard-v1.webp","coupe-surfaces-v1.webp"]){
    const route="/map-3d/vehicles/"+name;
    files.set(route,new URL("../public"+route,import.meta.url));
  }
  const server=createServer(async(req,res)=>{
    try{
      if(req.url==="/"){res.setHeader("Content-Type","text/html");res.end('<canvas width="1440" height="608"></canvas>');return;}
      if(req.url==="/compile.js"){res.setHeader("Content-Type","text/javascript");res.end("export "+compile.toString());return;}
      if(!files.has(req.url)){res.writeHead(404).end();return;}
      res.setHeader("Content-Type",req.url.endsWith(".js")?"text/javascript":req.url.endsWith(".webp")?"image/webp":"application/octet-stream");
      res.end(await readFile(files.get(req.url)));
    }catch{res.writeHead(500).end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  let browser;
  try{
    browser=await puppeteer.launch({headless:true,args:["--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]});
    const page=await browser.newPage();
    await page.goto("http://127.0.0.1:"+server.address().port);
    const png=await page.evaluate(async()=>{
      const {preloadCoupe,createCoupeRenderer}=await import("/campus3dCoupeRenderer.js");
      const {compile}=await import("/compile.js");
      const canvas=document.querySelector("canvas"),gl=canvas.getContext("webgl2",{alpha:true,antialias:true,preserveDrawingBuffer:true});
      await preloadCoupe();
      const renderer=createCoupeRenderer(gl,compile,()=>{});
      renderer.prepare();
      const eye=[4.9,-6.5,2.30],target=[.04,0,.48];
      const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
      const norm=v=>v.map(n=>n/Math.hypot(...v));
      const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
      const back=norm(eye.map((n,i)=>n-target[i])),right=norm(cross([0,0,1],back)),up=cross(back,right);
      const lens=1/Math.tan(13.2*Math.PI/360),aspect=canvas.width/canvas.height;
      const M=new Float32Array(16);
      for(let i=0;i<3;i++){
        M[4*i]=right[i]*lens/aspect;M[4*i+1]=up[i]*lens;
        M[4*i+2]=-back[i]*1.002;M[4*i+3]=-back[i];
      }
      M[12]=-dot(eye,right)*lens/aspect;M[13]=-dot(eye,up)*lens;
      M[14]=dot(eye,back)*1.002-.20;M[15]=dot(eye,back);
      const pose={R:[1,0,0,0,1,0,0,0,1],W0:[0,0],e:[1,0],n:[0,1],z:0};
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);
      renderer.draw([{s:{z:0,steer:-8},pose,fp:false,on:false,night:0}],M,eye,{pos:[.55,.55,.78],color:[1,.97,.93]});
      const error=gl.getError();if(error) throw new Error("Garage WebGL error "+error);
      const data=canvas.toDataURL("image/png");renderer.dispose();return data.split(",")[1];
    });
    // Fit the visible silhouette and keep even breathing room on the card.
    const cut=await sharp(Buffer.from(png,"base64")).trim({background:"#00000000",threshold:8}).png().toBuffer();
    const frame=await sharp(cut).resize(604,231,{fit:"contain",background:"#00000000"}).extend({
      top:6,bottom:6,left:10,right:10,background:"#00000000",
    }).webp({quality:93,alphaQuality:100}).toBuffer();
    await writeFile(destination,frame);
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
