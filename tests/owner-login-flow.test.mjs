import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real login component's handlers without a browser or real credentials.
const require=createRequire(import.meta.url);
const state=[];let cursor=0,completed=0;const navigations=[],calls=[],responses=[];
const router={push:path=>navigations.push(path),refresh:()=>navigations.push('refresh')};
const testModule={exports:{}};
const context={module:testModule,exports:testModule.exports,require:name=>name==='react'?{useState:initial=>{const slot=cursor++;if(!(slot in state))state[slot]=initial;return [state[slot],value=>{state[slot]=typeof value==='function'?value(state[slot]):value;}];}}:name==='next/navigation'?{useRouter:()=>router}:require(name),FormData:class{get(){return 'synthetic-test-password';}},fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});const next=responses.shift();assert.ok(next,'Unexpected network action');return {ok:next.ok,json:async()=>next.body};}};
const source=readFileSync(new URL('../components/LoginPanel.tsx',import.meta.url),'utf8');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
function render(){cursor=0;return testModule.exports.LoginPanel({adminMode:true,onSignedIn:async()=>{completed++;}});}
function nodes(tree){if(!tree||typeof tree!=='object')return [];return [tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)];}
function form(tree){return nodes(tree).find(n=>n.type==='form');}
const event={preventDefault(){},currentTarget:{}};

let tree=render();
responses.push({ok:true,body:{requiresSecondFactor:true}});
await form(tree).props.onSubmit(event);
tree=render();assert.ok(nodes(tree).some(n=>n.type==='input'&&n.props.name==='code'),'Password success must show the second factor');
assert.equal(completed,0);assert.deepEqual(navigations,[]);
responses.push({ok:false,body:{message:'Code not accepted.'}});
await form(tree).props.onSubmit(event);
tree=render();assert.ok(nodes(tree).some(n=>n.type==='input'&&n.props.name==='code'));assert.equal(completed,0);
responses.push({ok:true,body:{message:'Signed in.'}});
await form(tree).props.onSubmit(event);
assert.equal(completed,1,'Direct owner dashboard must load only after successful second-factor verification');
assert.deepEqual(navigations,[],'Embedded login should not redirect/reload instead of opening its parent dashboard');
assert.deepEqual(calls.map(c=>c.url),['/api/owner/login','/api/owner/login/verify','/api/owner/login/verify']);
console.log('Owner login second-factor and embedded completion checks passed.');


