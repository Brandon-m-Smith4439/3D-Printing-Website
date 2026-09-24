import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const allowed: Record<string, { ext: string; check: (bytes: Uint8Array) => boolean }> = {
  "image/png": { ext: "png", check: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  "image/jpeg": { ext: "jpg", check: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/webp": { ext: "webp", check: (b) => b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP" },
};

export async function POST(request: NextRequest) {
  if (!(await requestIsOwner(request))) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_BYTES + 100_000) return NextResponse.json({ message: "Image is too large. Maximum is 5 MB." }, { status: 413 });

  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ message: "Invalid upload." }, { status: 400 }); }
  const file = form.get("image");
  if (!(file instanceof File)) return NextResponse.json({ message: "Choose an image to upload." }, { status: 400 });
  const rule = allowed[file.type];
  if (!rule) return NextResponse.json({ message: "Only PNG, JPEG, and WebP images are allowed." }, { status: 415 });
  if (file.size < 1 || file.size > MAX_BYTES) return NextResponse.json({ message: "Image must be between 1 byte and 5 MB." }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!rule.check(bytes)) return NextResponse.json({ message: "The file contents do not match the selected image type." }, { status: 415 });
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  const filename = `${Date.now()}-${randomBytes(8).toString("hex")}.${rule.ext}`;
  await writeFile(path.join(dir, filename), bytes, { flag: "wx" });
  return NextResponse.json({ path: `/uploads/${filename}` }, { status: 201 });
}
