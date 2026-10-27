// Test-server-only export of the actual component; no production API changes.
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

const code = `import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { TimeOfDayLight } from '/src/components/Map/VenueMap.jsx';
import { WeatherProvider } from '/src/context/WeatherContext.jsx';
import { MicroclimateProvider } from '/src/context/MicroclimateContext.jsx';
import SunCalc from 'suncalc';
import { melbourneDate } from '/src/utils/sunPosition.js';
import { sunLightFor } from '/src/utils/mapSunLight.js';
import { INITIAL_VIEW_STATE } from '/src/config/mapConfig.js';
const clone = value => JSON.parse(JSON.stringify(value));
const maps = [];
function makeMap(generation) {
  const original = [
    {id:'standard-ambient',type:'ambient',properties:{intensity:['case',['==',['config','lightPreset'],'night'],.2,generation/10]}},
    {id:'standard-directional',type:'directional',properties:{color:['case',['==',['config','lightPreset'],'night'],'#778899','#ffffff']}}
  ];
  const map = {generation, original, lights:clone(original), events:[], idle:[], allIdle:[],
    getLights(){return this.lights;}, isStyleLoaded(){return true;},
    setLights(value){this.events.push({method:'setLights',value:clone(value)});for(const light of value){const existing=this.lights.find(item=>item.type===light.type);if(existing)Object.assign(existing.properties,clone(light.properties));}},
    setConfigProperty(importId,key,value){this.events.push({method:'setConfigProperty',importId,key,value});},
    setTerrain(value){this.events.push({method:'setTerrain',value});},
    getStyle(){return {layers:[{id:'test-extrusion',type:'fill-extrusion'}]};},
    setLayoutProperty(id,key,value){this.events.push({method:'setLayoutProperty',id,key,value});},
    once(type,fn){if(type==='idle'){this.idle.push(fn);this.allIdle.push(fn);}},
    off(type,fn){if(type==='idle')this.idle=this.idle.filter(item=>item!==fn);},
    dragPan:{disable(){},enable(){}}
  };maps.push(map);return map;
}
const mapRef = {current:makeMap(1)}, mapGenerationRef={current:1}, staleGenerationsRef={current:new Set()};
let props = {mapLoaded:true,generation:1,nightMode:false,todMinutes:720};
const root = createRoot(document.getElementById('probe'));
function render(patch={}) {
  props={...props,...patch};
  flushSync(()=>root.render(React.createElement(WeatherProvider,null,
    React.createElement(MicroclimateProvider,null,React.createElement(TimeOfDayLight,
      {...props,mapRef,mapGenerationRef,staleGenerationsRef})))));
}
window.lightProbe = {maps,mapRef,mapGenerationRef,staleGenerationsRef,render,makeMap,
  expectedSun(minutes){const sun=SunCalc.getPosition(melbourneDate(minutes),INITIAL_VIEW_STATE.latitude,INITIAL_VIEW_STATE.longitude);return sunLightFor(sun.altitude*180/Math.PI,sun.azimuth*180/Math.PI);},
  snapshot(){return clone(maps.map(({generation,events,original,lights})=>({generation,events,original,lights})));}};
render();`;

export const lightProbePlugin = {
  name: 'isolated-night-light-contract', enforce: 'pre',
  transform(source,id) {
    if (id.endsWith('/src/components/Map/VenueMap.jsx')) return `${source}\nexport { TimeOfDayLight };`;
  },
  resolveId(id) { if (id === '/__night-light-entry.jsx') return '\0night-light-probe.jsx'; },
  load(id) { if (id === '\0night-light-probe.jsx') return code; },
  configureServer(server) {
    server.middlewares.use('/__night-light-probe', async (_req,res) => {
      const html = await server.transformIndexHtml('/__night-light-probe',
        '<!doctype html><html><body><div id="explore-time-controls"></div><div id="probe"></div><script type="module" src="/__night-light-entry.jsx"></script></body></html>');
      res.setHeader('Content-Type','text/html');res.end(html);
    });
  },
};

const lights = map => map.events.filter(event => event.method === 'setLights');
const restored = map => map.original.map(light => light.type === 'directional' ? {...light, properties:{...light.properties,'cast-shadows':false,'shadow-intensity':0}} : light);
const preset = map => map.events.filter(event => event.key === 'lightPreset').at(-1)?.value;
export async function checkLightContract(page, baseURL) {
  await page.goto(`${baseURL}/__night-light-probe`);
  await expect.poll(()=>page.evaluate(()=>window.lightProbe?.snapshot()[0]?.events.length ?? 0)).toBeGreaterThan(0);
  let maps = await page.evaluate(()=>window.lightProbe.snapshot());
  assert.equal(preset(maps[0]),'day');
  assert.equal(typeof lights(maps[0]).at(-1).value[0].properties.intensity,'number');
  await page.getByRole('button',{name:'Fine-tune preview time',exact:true}).click();
  const slider = page.getByRole('slider',{name:'Time of day for 3D building shadows',exact:true});
  await expect(slider).toHaveValue('720');
  // Queue the real throttled input path, then change ownership in the same turn.
  await slider.evaluate(node=>{
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    for(const value of ['725','730']){setter.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));}
    window.lightProbe.render({nightMode:true});
  });
  await expect(slider).toHaveValue('730');
  maps = await page.evaluate(()=>window.lightProbe.snapshot());
  assert.equal(preset(maps[0]),'night');
  assert.deepEqual(lights(maps[0]).at(-1).value,restored(maps[0]));
  const nightWrites=lights(maps[0]).length;
  await slider.focus();await slider.press('ArrowRight');await slider.press('ArrowRight');
  await expect(slider).toHaveValue('740');
  await page.waitForTimeout(180);
  maps = await page.evaluate(()=>window.lightProbe.snapshot());
  assert.equal(lights(maps[0]).length,nightWrites,'night must block queued and new sun writes');
  await page.evaluate(()=>window.lightProbe.render({nightMode:false}));
  maps = await page.evaluate(()=>window.lightProbe.snapshot());
  assert.equal(preset(maps[0]),'day');
  assert.equal(typeof lights(maps[0]).at(-1).value[0].properties.intensity,'number');
  const currentSun=lights(maps[0]).at(-1).value;
  const expectedSun=await page.evaluate(()=>window.lightProbe.expectedSun(740));
  assert.deepEqual(currentSun.find(light=>light.type==='directional').properties.direction,expectedSun.direction,'return to Sun uses the latest slider time');
  assert.equal(currentSun.find(light=>light.type==='directional').properties['cast-shadows'],false);
  assert.equal(currentSun.find(light=>light.type==='directional').properties['shadow-intensity'],0);
  await page.evaluate(()=>{
    const p=window.lightProbe;p.staleGenerationsRef.current.add(1);p.mapGenerationRef.current=2;
    p.mapRef.current=p.makeMap(2);
    // Even manually firing detached callbacks from every old mode must be harmless.
    for(const fn of p.maps[0].allIdle)fn();
  });
  maps = await page.evaluate(()=>window.lightProbe.snapshot());
  assert.deepEqual(maps[1].events,[],'retired callbacks cannot touch the replacement map');
  await page.evaluate(()=>window.lightProbe.render({generation:2,nightMode:true}));
  maps = await page.evaluate(()=>window.lightProbe.snapshot());
  assert.equal(preset(maps[1]),'night');
  assert.deepEqual(lights(maps[1]).at(-1).value,restored(maps[1]),'resume snapshots its own Standard lights');
  assert.notDeepEqual(maps[1].original,maps[0].original);
  assert.ok(maps[1].events.some(e=>e.key==='show3dObjects'&&e.value===false));
  assert.ok(maps[1].events.some(e=>e.method==='setTerrain'&&e.value===null));
  assert.ok(maps[1].events.some(e=>e.method==='setLayoutProperty'&&e.value==='none'));
  const beforeStale=maps[1].events.length;
  await page.evaluate(()=>{const p=window.lightProbe;p.staleGenerationsRef.current.add(2);p.render({nightMode:false});});
  maps = await page.evaluate(()=>window.lightProbe.snapshot());
  assert.equal(maps[1].events.length,beforeStale,'stale generations cannot write presets or lights');
  await page.evaluate(()=>{const p=window.lightProbe;p.mapGenerationRef.current=3;p.mapRef.current=p.makeMap(3);p.render({generation:3,mapLoaded:false,nightMode:true});});
  maps = await page.evaluate(()=>window.lightProbe.snapshot());
  assert.deepEqual(maps[2].events,[],'unloaded generation waits');
  await page.evaluate(()=>window.lightProbe.render({mapLoaded:true}));
  maps = await page.evaluate(()=>window.lightProbe.snapshot());
  assert.equal(preset(maps[2]),'night');
  assert.deepEqual(lights(maps[2]).at(-1).value,restored(maps[2]));
  for(const map of maps)for(const write of lights(map)){const directional=write.value.find(light=>light.type==='directional');assert.equal(directional.properties['cast-shadows'],false);assert.equal(directional.properties['shadow-intensity'],0);}
  return {kind:'isolated actual TimeOfDayLight with fake Mapbox API',visual:false,
    sunWrites:true,nightRestoresStandard:true,nightBlocksQueuedAndSliderLights:true,
    returnToSunWrites:true,returnUsesLatestSunPosition:true,latestSliderMinutes:740,retiredCallbacksIgnored:true,
    resumedNightFreshSnapshot:true,staleGenerationIgnored:true,unloadedGenerationWaits:true,
    mobileGpuSuppression:true};
}
