import { NextRequest, NextResponse } from "next/server";
import { requestIsOwner } from "@/lib/owner-auth";
import { easyPostConfigurationSummary } from "@/lib/easypost";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){if(!await requestIsOwner(request))return NextResponse.json({message:"Sign in required."},{status:401});return NextResponse.json({shipping:await easyPostConfigurationSummary()},{headers:{"Cache-Control":"no-store"}});}
