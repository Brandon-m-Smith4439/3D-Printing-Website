import 'server-only';
import {CenterStore,centerDatabasePath} from './store.ts';
import {existsSync} from 'node:fs';
export function invalidateSlicingMaterialCosts(catalogIds:string[]){
 // Disabling the worker must not revive old accepted costs after price edits.
 // Do not create a business-center database merely to invalidate absent records.
 if(!existsSync(centerDatabasePath()))return;
 const s=new CenterStore();try{for(const p of s.snapshot().projects){if(p.materialPlan?.lines.some(l=>catalogIds.includes(l.catalogItemId)))s.reviewSliceCosts(p.id);}}finally{s.close();}
}
