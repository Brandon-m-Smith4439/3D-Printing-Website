import 'server-only';
import {NextRequest,NextResponse} from 'next/server';
import {requestIsOwner} from '../owner-auth';
import {sameOrigin} from '../owner-api';
import {readLimitedBody} from './body.ts';
export const privateHeaders={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
export const marketplaceJson=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:privateHeaders});
export async function ownerGate(request:NextRequest,mutation=false){if(mutation&&!sameOrigin(request))return marketplaceJson({message:'Origin rejected.'},403);if(!await requestIsOwner(request))return marketplaceJson({message:'Owner sign-in required.'},401);return null;}
export async function commandText(request:NextRequest){return JSON.parse((await readLimitedBody(request,8000)).toString('utf8')) as unknown;}
export function marketplaceFailure(e:unknown){const text=e instanceof Error?e.message:'';const safe=/^(Authorize the owner|Authorized Etsy shop|Authorization (expired|parameters)|Etsy (is disabled|authorization must|request failed|rate limit)|Invalid Etsy (market payload|receipt payload|refresh identity|refresh scopes|authorization response|application configuration|transaction amounts)|Invalid or oversized Etsy response|Register the exact HTTPS|A marketplace request|Configure MARKETPLACE_TOKEN_KEY|Prepare a release|Current revision must|A listing draft)/.test(text);return marketplaceJson({message:safe?text:'Marketplace action unavailable. Check configuration and refresh task status.'},409);}
