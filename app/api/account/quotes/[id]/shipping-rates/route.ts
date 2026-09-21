import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/customer-auth";
import { sameOrigin } from "@/lib/owner-api";
import { quoteById } from "@/lib/quote-store";
import { getLiveShippingRates } from "@/lib/easypost";
import { shippingAddressSchema } from "@/lib/quote-types";

const attempts = new Map<string,{count:number;windowStart:number}>();
function limited(id:string){const now=Date.now();const current=attempts.get(id);if(!current||now-current.windowStart>60_000){attempts.set(id,{count:1,windowStart:now});return false;}current.count++;return current.count>12;}

export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
  const customer=await customerFromRequest(request);if(!customer)return NextResponse.json({message:"Sign in required."},{status:401});
  if(!customer.emailVerified)return NextResponse.json({message:"Verify your email before requesting live shipping rates."},{status:403});
  if(!sameOrigin(request))return NextResponse.json({message:"Request origin was not accepted."},{status:403});
  if(limited(customer.id))return NextResponse.json({message:"Too many rate requests. Please wait a minute and try again."},{status:429});
  const {id}=await context.params;const quote=await quoteById(id);if(!quote||quote.customerAccountId!==customer.id)return NextResponse.json({message:"Quote not found."},{status:404});
  if(quote.status!=="sent")return NextResponse.json({message:"Live shipping can only be selected while a quote is awaiting your response."},{status:409});
  if(quote.fulfillmentMode!=="shipping")return NextResponse.json({message:"This quote is not configured for carrier shipping."},{status:409});
  let body:unknown;try{const raw=await request.text();if(raw.length>8_000)return NextResponse.json({message:"Shipping address request is too large."},{status:413});body=JSON.parse(raw);}catch{return NextResponse.json({message:"Invalid shipping address."},{status:400});}
  const parsed=shippingAddressSchema.safeParse(body);if(!parsed.success)return NextResponse.json({message:"Please check the shipping address.",fieldErrors:parsed.error.flatten().fieldErrors},{status:400});
  try{const result=await getLiveShippingRates(quote,parsed.data);return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"Could not calculate live shipping rates."},{status:502});}
}
