import assert from 'node:assert/strict';import {createServer} from 'node:http';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
const server=createServer((_request,response)=>{response.writeHead(503);response.end('temporarily unavailable');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;let exited=false;
const child=spawn(process.execPath,['scripts/slicer-worker.mjs'],{windowsHide:true,stdio:'ignore',env:{...process.env,AI_CENTER_SLICER_SITE_URL:url,AI_CENTER_SLICER_ALLOW_LOCALHOST:'true',AI_CENTER_SLICER_WORKER_TOKEN:'a'.repeat(64),AI_CENTER_SLICER_EXECUTABLE:'unused-test-path',AI_CENTER_SLICER_RESOURCES:'unused-test-path',AI_CENTER_SLICER_WORK_ROOT:'unused-test-path'}});
child.once('exit',()=>{exited=true;});
try{await delay(1000);assert.equal(exited,false,'Startup 503 should back off instead of exiting');console.log('Worker startup recovery passed');}finally{child.kill();await new Promise(resolve=>server.close(resolve));}
