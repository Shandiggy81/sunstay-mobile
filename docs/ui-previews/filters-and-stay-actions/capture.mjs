// Static design QA, not an app test. No APIs, credentials, Vite or production UI.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
const folder=fileURLToPath(new URL('./',import.meta.url));
const root=path.resolve(folder,'../../..');
const prefix='/docs/ui-previews/filters-and-stay-actions/';
const mime={'.html':'text/html','.css':'text/css','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2','.json':'application/json','.md':'text/plain'};
const server=http.createServer(async(req,res)=>{
  try{const url=new URL(req.url,'http://localhost');const target=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!target.startsWith(root+path.sep))throw Error('invalid path');
    const data=await fs.readFile(target);res.writeHead(200,{'Content-Type':mime[path.extname(target)]??'application/octet-stream'});res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(5364,'127.0.0.1',resolve));
const origin='http://127.0.0.1:5364';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium'});
const results=[],errors=[];
try{
 for(const [width,height] of [[390,844],[320,568]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  for(const file of ['filters-a','filters-b','stay-action']){
   await page.goto(origin+prefix+file+'.html');await page.evaluate(()=>document.fonts.ready);
   await page.locator('.clay').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
   const metrics=await page.evaluate(()=>({
    width:document.documentElement.scrollWidth,
    brokenImages:[...document.images].filter(img=>!img.complete||!img.naturalWidth).map(img=>img.src),
    controls:[...document.querySelectorAll('button,a,summary')].filter(el=>el.getClientRects().length).map(el=>({label:el.getAttribute('aria-label')||el.textContent.trim(),width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})),
    text:[...document.querySelectorAll('*')].filter(el=>[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&!el.closest('svg')).map(el=>({label:el.textContent.slice(0,60),size:parseFloat(getComputedStyle(el).fontSize)})),
    scroller:document.querySelector('.sheet-scroll,.stay-scroll')?{height:document.querySelector('.sheet-scroll,.stay-scroll').clientHeight,scrollHeight:document.querySelector('.sheet-scroll,.stay-scroll').scrollHeight}:null
   }));
   assert(metrics.width<=width,`${file}: horizontal page overflow`);assert.deepEqual(metrics.brokenImages,[]);
   for(const c of metrics.controls){assert(c.width>=44&&c.height>=44,`${file}: small control ${JSON.stringify(c)}`);}
   for(const t of metrics.text)assert(t.size>=12,`${file}: text below 12px`);
   const primary=page.locator('.primary');const hit=await primary.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});assert(hit,'Primary action is obscured');
   if(file==='stay-action'){
    assert.equal(await primary.getAttribute('href'),'https://www.questapartments.com.au/properties/vic/st-kilda/quest-st-kilda-bayside');
    assert.equal(await primary.getAttribute('target'),'_blank');assert.equal(await primary.getAttribute('rel'),'noopener noreferrer');
   }
   await page.screenshot({path:path.join(folder,'screenshots',`${file}-${width}.png`)});
   results.push({file,width,height,...metrics});
   if(file==='filters-a'){
    const group=page.locator('details').filter({has:page.locator('summary').filter({hasText:'Stays & homes'})});await group.locator('summary').click();
    await page.locator('.sheet-scroll').evaluate(el=>el.scrollTop=el.scrollHeight);await page.screenshot({path:path.join(folder,'screenshots',`filters-a-expanded-${width}.png`)});
    assert.equal(await page.locator('button[data-filter-id="all-stays"][aria-pressed="true"]').count(),2);
   }
  }
  await page.goto(origin+prefix+'filters-a.html');
  const aIds=await page.locator('details [data-filter-id]').evaluateAll(els=>els.map(el=>el.dataset.filterId).sort());
  const facts=JSON.parse(await fs.readFile(path.join(folder,'facts.json'),'utf8'));
  assert.deepEqual(aIds,facts.groups.flatMap(group=>group.ids).sort());assert.equal(new Set(aIds).size,36);
  for(const group of facts.groups){await page.goto(origin+prefix+`filters-b-${group.id}.html`);assert.equal(await page.locator('[data-filter-id]').count(),group.ids.length);}
  await context.close();
 }
 const gallery=await browser.newPage({viewport:{width:1200,height:1120}});
 await gallery.goto(origin+prefix+'index.html');await gallery.evaluate(()=>document.fonts.ready);
 await gallery.locator('figure img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
 await gallery.screenshot({path:path.join(folder,'screenshots','overview.png'),fullPage:true});await gallery.close();
 assert.deepEqual(errors,[]);
 const channel=hex=>{const n=parseInt(hex,16)/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;};
 const luminance=hex=>{const rgb=hex.replace('#','');return .2126*channel(rgb.slice(0,2))+.7152*channel(rgb.slice(2,4))+.0722*channel(rgb.slice(4,6));};
 const pairs=[['#0f172a','#ffffff'],['#ffffff','#0f172a'],['#64748b','#ffffff'],['#64748b','#fffbf3'],['#92400e','#fffbeb'],['#92400e','#ffffff'],['#475569','#ffffff'],['#0f172a','#fffbf3']].map(([text,background])=>{const a=luminance(text),b=luminance(background);const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert(ratio>=4.5);return{text,background,ratio:Number(ratio.toFixed(2))};});
 await fs.writeFile(path.join(folder,'checks.json'),JSON.stringify({viewports:results.map(({file,width,height,scroller,controls})=>({file,width,height,scroller,minTouchWidth:Math.min(...controls.map(c=>c.width)),minTouchHeight:Math.min(...controls.map(c=>c.height))})),contrast:pairs,errors},null,2)+'\n');
 console.log('PASS: six viewport screenshots, two expanded states, all 36 filter IDs, targets ≥44px, text ≥12px, contrast ≥4.5:1, no overflow, real property URL, zero browser errors.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
