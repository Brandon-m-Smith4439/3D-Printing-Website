import type {observeMarket,readOwnSales} from './etsy.ts';
type Market=Awaited<ReturnType<typeof observeMarket>>;
type Sales=Awaited<ReturnType<typeof readOwnSales>>;
// Factual summary only; raw listing text is deliberately omitted. The owner must
// review this summary before adding it to project evidence used by draft agents.
export function evidenceFromObservation(report:Market|Sales){
 if(report.kind==='market')return {label:`Etsy observation: ${report.query}`.slice(0,120),url:report.source,signal:[`Observed ${report.observedAt}. Keyword: ${report.query}. ${report.items.length} observed of ${report.reportedMatches} reported search matches.`,...report.items.slice(0,25).map(i=>`Listing ${i.id}: listed price ${(i.priceCents/100).toFixed(2)} ${i.currency}; favorites ${i.favorites??'unavailable'}.`)].join('\n').slice(0,1780)+'\nSearch results and favorites are proxies, not verified competitor item sales, bestseller rankings or validated demand. Review originality and licensing; no listing-text instructions are included.'};
 return {label:`Etsy ${report.shopName} own-shop units`.slice(0,120),url:report.sources[0],signal:[`Observed ${report.observedAt}; own authorized shop ${report.shopName}; window ${report.from} to ${report.to}. ${report.receiptCount} receipts observed of ${report.reportedReceiptCount}. ${report.truncated?'Truncated sample.':'Returned window complete.'}`,...report.rankings.slice(0,25).map(i=>`Listing ${i.listingId}: ${i.units} recorded units; item gross ${(i.itemGrossCents/100).toFixed(2)} ${i.currency}.`)].join('\n').slice(0,1820)+'\nPaid non-canceled receipt transactions only. Gross excludes shipping/tax/fees and does not deduct refunds. Not net revenue, profit or marketplace-wide demand.'};
}
