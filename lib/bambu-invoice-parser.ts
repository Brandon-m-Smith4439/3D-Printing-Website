import type { BambuFilamentCatalogItem, BambuPackageType } from './pricing-types.ts';
import type { ParsedBambuInvoice, ReviewedBambuInvoiceLine } from './bambu-invoice-types.ts';

function cents(value:string|undefined){if(!value)return 0;const n=Number(value.replace(/[$,]/g,''));return Number.isFinite(n)?Math.round(n*100):0;}
function normalize(value:string){return value.toLowerCase().replace(/[—–-]/g,' ').replace(/[^a-z0-9+]+/g,' ').trim().replace(/\s+/g,' ');}
function isoDate(raw:string){
  const text=raw.trim();
  const parsed=new Date(text);
  if(!Number.isFinite(parsed.getTime()))return '';
  const y=parsed.getUTCFullYear();const m=String(parsed.getUTCMonth()+1).padStart(2,'0');const d=String(parsed.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
function namedMoney(text:string,label:string){
  const re=new RegExp(`^\\s*${label}\\s*[:]?\\s*(-?\\$?[0-9][0-9,]*(?:\\.[0-9]{2})?)\\s*$`,'im');
  const m=text.match(re);return m?Math.abs(cents(m[1])):0;
}
function extractField(line:string,key:string){
  const re=new RegExp(`${key}:\\s*([^|]+)`,'i');return line.match(re)?.[1]?.trim()||'';
}
function packageTypeFromText(value:string):BambuPackageType{
  const n=normalize(value);if(n.includes('refill'))return 'refill';if(n.includes('spool'))return 'with-spool';return 'filament-only';
}
function matchCatalog(productName:string,catalog:BambuFilamentCatalogItem[]){
  const target=normalize(productName);
  if(!target)return null;
  const exact=catalog.filter(item=>normalize(item.displayName)===target);
  if(exact.length===1)return exact[0];
  const packageType=packageTypeFromText(productName);
  const candidates=catalog.filter(item=>{
    const family=normalize(item.familyKey.replaceAll('-',' '));
    const display=normalize(item.displayName);
    const familyWords=family.split(' ').filter(Boolean);
    const familyMatch=familyWords.length>0&&familyWords.every(word=>target.includes(word));
    const displayWords=display.replace(/\b(refill|with spool|spool|kg|0 5|0 75)\b/g,'').split(' ').filter(word=>word.length>1);
    const displayMatch=displayWords.length>0&&displayWords.every(word=>target.includes(word));
    if(!(familyMatch||displayMatch))return false;
    if(target.includes('refill'))return item.packageType==='refill';
    if(target.includes('spool'))return item.packageType==='with-spool';
    return packageType==='filament-only'||true;
  });
  return candidates.length===1?candidates[0]:null;
}

export function parseBambuInvoiceText(text:string,catalog:BambuFilamentCatalogItem[]):ParsedBambuInvoice{
  const warnings:string[]=[];
  const orderNumber=text.match(/Order\s*#\s*([^\s\n]+)/i)?.[1]?.trim()||'';
  const orderDateRaw=text.match(/Order\s*Date:\s*([^\n]+)/i)?.[1]?.trim()||'';
  const orderDate=isoDate(orderDateRaw);
  if(!orderNumber)warnings.push('Order number could not be parsed.');
  if(!orderDate)warnings.push('Order date could not be parsed.');
  const itemLines=text.split(/\r?\n/).map(line=>line.trim()).filter(line=>/^ITEM:/i.test(line));
  const lines:ReviewedBambuInvoiceLine[]=itemLines.map((line,index)=>{
    const productNameRaw=extractField(line,'ITEM');
    const catalogItem=matchCatalog(productNameRaw,catalog);
    const quantity=Math.max(1,Math.round(Number(extractField(line,'QTY'))||1));
    const unitListPriceCents=cents(extractField(line,'UNIT'));
    const lineSubtotalCents=cents(extractField(line,'LINE'))||unitListPriceCents*quantity;
    const directLineDiscountCents=cents(extractField(line,'DISCOUNT'));
    if(productNameRaw&&/\b(pla|petg|abs|asa|tpu|pc|pa6|paht|ppa|pet cf|pps|pva|support)\b/i.test(productNameRaw)&&!catalogItem)warnings.push(`Filament line ${index+1} needs catalog review.`);
    return {id:`line-${index+1}`,productNameRaw,skuRaw:extractField(line,'SKU'),colorName:extractField(line,'COLOR'),quantity,unitListPriceCents,directLineDiscountCents,lineSubtotalCents,catalogItemId:catalogItem?.id||'',isFilament:Boolean(catalogItem)||/\b(pla|petg|abs|asa|tpu|pc|pa6|paht|ppa|pet cf|pps|pva|support)\b/i.test(productNameRaw),packageType:catalogItem?.packageType||packageTypeFromText(productNameRaw),netWeightGramsPerUnit:catalogItem?.netWeightGrams||0};
  });
  if(lines.length===0)warnings.push('No invoice item lines were parsed.');
  const subtotalCents=namedMoney(text,'Subtotal');
  const discountCents=namedMoney(text,'Order\\s+discount');
  const shippingCents=namedMoney(text,'Shipping');
  const taxCents=namedMoney(text,'Tax');
  const totalCents=namedMoney(text,'Total');
  const expected=subtotalCents-discountCents+shippingCents+taxCents;
  if(totalCents>0&&Math.abs(expected-totalCents)>1)warnings.push('Invoice total does not reconcile with subtotal, discount, shipping, and tax.');
  const unmatchedFilament=lines.filter(line=>line.isFilament&&!line.catalogItemId).length;
  return {orderNumber,orderDate,subtotalCents,discountCents,shippingCents,taxCents,totalCents,lines,warnings,parseStatus:warnings.length||unmatchedFilament?'review-required':'parsed'};
}
