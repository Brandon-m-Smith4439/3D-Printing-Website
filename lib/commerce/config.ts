import {z} from 'zod';
export function commerceConfig(){
 const countries=(process.env.COMMERCE_SHIPPING_COUNTRIES||'').split(',').map(s=>s.trim()).filter(Boolean);
 const shippingCents=Number(process.env.COMMERCE_SHIPPING_RATE_CENTS);
 return {catalogEnabled:process.env.COMMERCE_CATALOG_ENABLED==='true',checkoutEnabled:process.env.COMMERCE_CHECKOUT_ENABLED==='true',taxReviewed:process.env.COMMERCE_TAX_REVIEWED==='true',automaticTax:process.env.COMMERCE_AUTOMATIC_TAX==='true'&&process.env.COMMERCE_TAX_REGISTRATION_CONFIRMED==='true',countries,shippingCents,shippingReady:countries.length>0&&countries.every(c=>['US','CA','GB','AU'].includes(c))&&z.number().int().min(0).max(100000).safeParse(shippingCents).success};
}
export function checkoutConfiguration(physical:boolean){const c=commerceConfig();if(!c.catalogEnabled||!c.checkoutEnabled||!c.taxReviewed)throw Error('Commerce needs launch and tax configuration.');if(process.env.COMMERCE_AUTOMATIC_TAX==='true'&&!c.automaticTax)throw Error('Confirm an active Stripe Tax registration before enabling tax.');if(physical&&!c.shippingReady)throw Error('Physical shipping countries and rate must be configured.');return c;}
