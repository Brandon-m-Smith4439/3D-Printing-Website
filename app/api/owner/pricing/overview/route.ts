import { NextRequest,NextResponse } from 'next/server';
import { requestIsOwner } from '@/lib/owner-auth';
import { ensureBambuCatalogSeeded,readBambuCatalog,readPricingSettings } from '@/lib/pricing-store';
import { readFilamentPurchaseLots } from '@/lib/bambu-purchase-store';
import { resolveMaterialCost } from '@/lib/material-cost-resolver';
import { readCostSnapshots } from '@/lib/quote-cost-store';
import { readPricingPresets } from '@/lib/pricing-preset-store';
import { readRequests } from '@/lib/request-store';
import { readQuotes } from '@/lib/quote-store';
import { buildProfitabilityReport, type ProfitabilityRange } from '@/lib/profitability-report';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 if(!await requestIsOwner(request))return NextResponse.json({message:'Sign in required.'},{status:401});
 await ensureBambuCatalogSeeded(); const range=(request.nextUrl.searchParams.get('range')||'30d') as ProfitabilityRange; const safeRange=['7d','30d','90d','all'].includes(range)?range:'30d';
 const [settings,catalog,lots,snapshots,presets,requests,quotes]=await Promise.all([readPricingSettings(),readBambuCatalog(),readFilamentPurchaseLots(),readCostSnapshots(),readPricingPresets(),readRequests(),readQuotes()]);
 const materialCosts=Object.fromEntries(catalog.map(item=>[item.id,resolveMaterialCost(item,lots)]));
 const report=buildProfitabilityReport({requests,quotes,snapshots,now:new Date(),range:safeRange});
 return NextResponse.json({settings,catalog,materialCosts,presets,report,purchaseLotCount:lots.length,costSnapshotCount:snapshots.length},{headers:{'Cache-Control':'no-store'}});
}
