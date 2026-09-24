import { NextRequest, NextResponse } from "next/server";
import { requestIsOwner } from "@/lib/owner-auth";
import { readAudit } from "@/lib/audit-log";
export async function GET(request:NextRequest){if(!await requestIsOwner(request))return NextResponse.json({message:"Sign in required."},{status:401});return NextResponse.json({entries:await readAudit(300)},{headers:{"Cache-Control":"no-store"}});}
