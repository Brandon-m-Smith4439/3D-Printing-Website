import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const names={'x2d-04-020-pla-basic':'Bambu PLA Basic @BBL X2D 0.4 nozzle','x2d-04-020-pla-matte':'Bambu PLA Matte @BBL X2D 0.4 nozzle','x2d-04-020-petg':'Bambu PETG HF @BBL X2D 0.4 nozzle'};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export function resolveProfiles(resourcesDir,profileId){
 if(!Object.hasOwn(names,profileId))throw Error('Unknown approved profile');
 const presets=new Map();
 for(const folder of ['machine','process','filament'])for(const entry of fs.readdirSync(path.join(resourcesDir,folder),{recursive:true})){const file=path.join(resourcesDir,folder,entry);if(!file.endsWith('.json'))continue;const data=JSON.parse(fs.readFileSync(file,'utf8'));if(data.name)presets.set(data.name,{data,file});}
 function resolve(name,stack=[]){if(stack.includes(name))throw Error('Profile inheritance cycle');const preset=presets.get(name);if(!preset)throw Error('Missing trusted profile');const data={...(preset.data.inherits?resolve(preset.data.inherits,[...stack,name]):{}),...preset.data};delete data.inherits;
  const directory=path.dirname(preset.file),prefix=path.basename(preset.file,'.json')+' template ';
  for(const f of fs.readdirSync(directory).filter(f=>f.startsWith(prefix)&&f.endsWith('.json')).sort()){const t=JSON.parse(fs.readFileSync(path.join(directory,f),'utf8'));Object.assign(data,Object.fromEntries(Object.entries(t).filter(([k])=>k.includes('gcode'))));}
  return data;
 }
 const profiles={machine:resolve('Bambu Lab X2D 0.4 nozzle'),process:resolve('0.20mm Standard @BBL X2D'),filament:resolve(names[profileId])};
 return {...profiles,profileHash:createHash('sha256').update(JSON.stringify(canonical(profiles))).digest('hex')};
}
