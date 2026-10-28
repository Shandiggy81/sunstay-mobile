// Test-only export: exercise the actual marker DOM without a token or basemap.
const entry = `import '/src/index.css';
import {createMarkerEl,repaintVenueMarker,createClusterMarkerEl} from '/src/components/Map/VenueMap.jsx';
import {sunPinView} from '/src/utils/sunPin.js';
import coffee from '/src/assets/clay/pins/coffee.webp';
const samples=[{score:50},{score:38},{score:90,selected:true},{score:38,highlighted:true},{score:null},{score:50,pinKey:'heater'}];
const records=samples.map(sample=>{const record={...sample,emoji:'',iconUrl:coffee,venueName:'Fixture venue'};record.el=createMarkerEl(sunPinView(record));const row=document.createElement('div');row.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:16px';const label=document.createElement('span');label.textContent=sample.selected?'Selected':sample.highlighted?'Highlighted':sample.pinKey?'Condition':sample.score==null?'Unknown':'Venue';row.append(label,record.el);document.getElementById('pins').append(row);return record;});
document.getElementById('cluster').append(createClusterMarkerEl(7,{}));
window.pinProbe={setMode(nightMode){document.getElementById('mode').textContent=nightMode?'After Dark':'Sun';for(const record of records){record.nightMode=nightMode;repaintVenueMarker(record);}},records};`;
export const pinProbePlugin={
 name:'pin-renderer-probe',enforce:'pre',
 transform(code,id){if(id.endsWith('/src/components/Map/VenueMap.jsx'))return code+'\nexport {createMarkerEl,repaintVenueMarker,createClusterMarkerEl};';},
 resolveId(id){if(id==='/__pins-entry.js')return '\0pins-entry';},
 load(id){if(id==='\0pins-entry')return entry;},
 configureServer(server){server.middlewares.use('/__pins',async(_req,res)=>{const html=await server.transformIndexHtml('/__pins',`<!doctype html><html><body style="margin:0;background:#fffbf3;color:#0f172a"><main style="padding:20px"><h1 id="mode" style="font-size:24px">Sun</h1><p>Isolated pin renderer · no basemap</p><div id="pins"></div><div id="cluster" style="display:flex;justify-content:center;margin-top:20px"></div><p style="text-align:center">Cluster count stays 7</p></main><script type="module" src="/__pins-entry.js"></script></body></html>`);res.setHeader('Content-Type','text/html');res.end(html);});}
};
