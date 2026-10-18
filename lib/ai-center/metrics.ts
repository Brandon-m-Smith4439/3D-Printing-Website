import 'server-only';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildProfitabilityReport } from '../profitability-report.ts';
import type { StoredRequest } from '../request-types.ts';
import type { StoredQuote } from '../quote-types.ts';
import type { QuoteCostSnapshot } from '../pricing-types.ts';
import type { HistoricalProfitRecord } from '../historical-profit-types.ts';
import type { FinalInvoiceRecord } from '../final-invoice-types.ts';

export function businessOverview() {
  const file=path.resolve(/*turbopackIgnore: true*/ process.env.DATABASE_PATH || path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(process.cwd(),'data'),'3d-printing-business.sqlite'));
  const unavailable={available:false as const,message:'Business data unavailable. Configure an existing Mesh Harbor database; no revenue assumptions or sample financial data are displayed.'};
  if(!existsSync(/*turbopackIgnore: true*/ file))return unavailable;
  let db: DatabaseSync|undefined;
  try {
    db=new DatabaseSync(file,{readOnly:true});
    db.exec('PRAGMA busy_timeout=5000; BEGIN');
    const read=<T,>(collection:string)=>(db!.prepare('SELECT json FROM app_records WHERE collection=?').all(collection) as {json:string}[]).map(r=>JSON.parse(r.json) as T);
    const requests=read<StoredRequest>('requests'),quotes=read<StoredQuote>('quotes'),snapshots=read<QuoteCostSnapshot>('quote-cost-snapshots'),history=read<HistoricalProfitRecord>('historical-profit-records'),invoices=read<FinalInvoiceRecord>('final-invoices');
    const customers=db.prepare("SELECT COUNT(*) AS n FROM app_records WHERE collection='customers'").get() as {n:number};
    const queue=db.prepare("SELECT COUNT(*) AS n FROM app_records WHERE collection='queue'").get() as {n:number};
    db.exec('COMMIT');
    const amount=(n:number|undefined)=>Number.isSafeInteger(n)&&n!>=0?n!:0;
    const recordedNetPaymentsCents=quotes.reduce((sum,q)=>sum+(q.payments||[]).reduce((n,p)=>n+amount(p.processorAmountCents??p.amountCents),0)-(q.refunds||[]).filter(r=>r.status==='succeeded').reduce((n,r)=>n+amount(r.amountCents),0)+(q.cashFinalPaidAt?amount(q.cashFinalPaidCents):0),0)+invoices.reduce((n,i)=>n+amount(i.amountPaidCents),0);
    return {available:true as const,source:'Existing Mesh Harbor SQLite records',asOf:new Date().toISOString(),counts:{requests:requests.length,activeRequests:requests.filter(r=>!['completed','declined','cancelled','canceled'].includes(r.status)).length,quotes:quotes.length,customers:Number(customers.n),queue:Number(queue.n)},recordedNetPaymentsCents,profitability:buildProfitabilityReport({requests,quotes,snapshots,historicalRecords:history,now:new Date(),range:'all'}),recent:requests.slice().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,10).map(r=>({id:r.id,code:r.requestCode,status:r.status,updatedAt:r.updatedAt})),limitations:'All-time recorded payments include deposits, final invoices, cash final payments, and succeeded refunds. This is not bank reconciliation; processing fees, taxes, external sales, and unrecorded refunds may be missing. Contribution figures use the existing cost engine; uncosted work is excluded from both costed revenue and contribution profit. Customers means registered account count; contacts and passwords are not returned.'};
  } catch {return unavailable;} finally {db?.close();}
}
