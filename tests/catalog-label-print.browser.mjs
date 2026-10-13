// Runs in Linux CI only; no user browser, credentials or carrier calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),exports={};
const source=await fs.readFile(new URL('../components/ShippingLabelPrint.tsx',import.meta.url),'utf8');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require,encodeURIComponent});
const css=await fs.readFile(new URL('../app/globals.css',import.meta.url),'utf8');
const markup=renderToStaticMarkup(React.createElement(exports.ShippingLabelPrint,{id:'fixture',test:true})).replace(/src="[^"]+"/,'src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII="');
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'catalog-print-'));
try{
 const html=path.join(dir,'label.html'),pdf=path.join(dir,'label.pdf');
 await fs.writeFile(html,`<!doctype html><html><head><style>${css}</style></head><body><div style="padding:16px">TEST banner</div><header class="site-header" style="height:100px">Header</header><main><section class="section"><h1>Owner label</h1>${markup}</section></main><footer class="site-footer"><div class="footer-grid">Footer</div><div class="footer-bottom">Links</div></footer></body></html>`);
 execFileSync('google-chrome',['--headless=new','--no-sandbox','--disable-gpu','--no-pdf-header-footer',`--user-data-dir=${dir}/chrome`,`--print-to-pdf=${pdf}`,`file://${html}`],{timeout:30000,stdio:'pipe'});
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const loading=getDocument({data:new Uint8Array(await fs.readFile(pdf)),useSystemFonts:true}),doc=await loading.promise;
 assert.equal(doc.numPages,1,'Thermal printing must produce exactly one label');
 const page=await doc.getPage(1),view=page.getViewport({scale:1});
 assert.ok(Math.abs(view.width-288)<1 && Math.abs(view.height-432)<1,'Label page must be 4 by 6 inches');
 assert.equal((await page.getTextContent()).items.length,0,'Shared page text must not print');
 await loading.destroy();
 console.log('Actual Chrome PDF: one 4x6 page; shared header/footer removed from print flow.');
}finally{await fs.rm(dir,{recursive:true,force:true});}
