import type { QuoteCostSnapshot } from './pricing-types.ts';

export type ProfitabilityRange='7d'|'30d'|'90d'|'all';
export type ProfitabilityReport={
  range:ProfitabilityRange;
  active:{revenueCents:number;directCostCents:number;contributionProfitCents:number;contributionMarginBasisPoints:number;belowTargetCount:number;uncostedCount:number};
  completed:{revenueCents:number;directCostCents:number;contributionProfitCents:number;contributionMarginBasisPoints:number;averageProfitCents:number;completedCount:number;uncostedCount:number};
};
type RequestLike={id:string;status:string;updatedAt:string;createdAt:string};
type QuoteLike={id:string;requestId:string;revision:number;status:string;totalCents:number;updatedAt:string};
function margin(revenue:number,profit:number){return revenue>0?Math.round(profit/revenue*10_000):0;}
function latestQuotes(quotes:QuoteLike[]){const map=new Map<string,QuoteLike>();for(const q of quotes){if(['void','draft'].includes(q.status))continue;const cur=map.get(q.requestId);if(!cur||q.revision>cur.revision||(q.revision===cur.revision&&q.updatedAt>cur.updatedAt))map.set(q.requestId,q);}return map;}
function inRange(value:string,now:Date,range:ProfitabilityRange){if(range==='all')return true;const days=range==='7d'?7:range==='30d'?30:90;const t=Date.parse(value);return Number.isFinite(t)&&now.getTime()-t<=days*86_400_000&&t<=now.getTime();}
function bestSnapshot(requestId:string,quote:QuoteLike,snapshots:QuoteCostSnapshot[],completed:boolean){const matches=snapshots.filter(s=>s.requestId===requestId&&s.quoteId===quote.id&&s.quoteRevision===quote.revision);if(completed)return matches.find(s=>s.status==='finalized')||matches.find(s=>s.status==='actual')||null;return matches.find(s=>s.status==='estimate')||matches.find(s=>s.status==='actual')||matches.find(s=>s.status==='finalized')||null;}
export function buildProfitabilityReport(input:{requests:RequestLike[];quotes:QuoteLike[];snapshots:QuoteCostSnapshot[];now:Date;range:ProfitabilityRange}):ProfitabilityReport{
  const qByRequest=latestQuotes(input.quotes);
  let ar=0,ac=0,ap=0,below=0,au=0;
  let cr=0,cc=0,cp=0,completedCount=0,cu=0,costedCompleted=0;
  for(const request of input.requests){
    const quote=qByRequest.get(request.id);
    if(request.status==='completed'){
      if(!inRange(request.updatedAt,input.now,input.range))continue;
      completedCount++;
      if(!quote){cu++;continue;}
      const snap=bestSnapshot(request.id,quote,input.snapshots,true);
      if(!snap){cu++;continue;}
      cr+=snap.quotedRevenueCents;cc+=snap.directCostCents;cp+=snap.contributionProfitCents;costedCompleted++;
      continue;
    }
    if(request.status==='declined'||!quote)continue;
    const snap=bestSnapshot(request.id,quote,input.snapshots,false);
    if(!snap){au++;continue;}
    ar+=snap.quotedRevenueCents;ac+=snap.directCostCents;ap+=snap.contributionProfitCents;
    if(snap.targetMarginBasisPoints>0&&snap.contributionMarginBasisPoints<snap.targetMarginBasisPoints)below++;
  }
  return {range:input.range,active:{revenueCents:ar,directCostCents:ac,contributionProfitCents:ap,contributionMarginBasisPoints:margin(ar,ap),belowTargetCount:below,uncostedCount:au},completed:{revenueCents:cr,directCostCents:cc,contributionProfitCents:cp,contributionMarginBasisPoints:margin(cr,cp),averageProfitCents:costedCompleted?Math.round(cp/costedCompleted):0,completedCount,uncostedCount:cu}};
}
