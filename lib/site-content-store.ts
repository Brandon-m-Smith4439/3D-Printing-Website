import "server-only";
import { z } from "zod";
import { defaultSiteContent, type SiteContent } from "@/lib/site";
import { readSingleton, writeSingleton } from "@/lib/database";

let writeChain = Promise.resolve();

const localImagePath = z.string().trim().min(1).max(300).refine((value) => value.startsWith("/") && !value.includes("..") && !value.includes("\\"), "Use a local site image path.");
const externalUrl = z.string().trim().url().max(500);

export const galleryItemSchema = z.object({
  id: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/),
  title: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(400),
  image: localImagePath,
  featured: z.boolean().optional().default(false),
});

export const siteContentSchema = z.object({
  name: z.string().trim().min(1).max(80),
  tagline: z.string().trim().min(1).max(140),
  description: z.string().trim().min(1).max(300),
  logoImage: localImagePath,
  logoAlt: z.string().trim().min(1).max(120),
  logoLetters: z.string().trim().min(1).max(4),
  businessTimeZone: z.string().trim().min(1).max(80),
  etsyUrl: externalUrl,
  whatnotUrl: externalUrl,
  galleryItems: z.array(galleryItemSchema).max(40),
});

export async function getSiteContent(): Promise<SiteContent> {
  try {
    const saved = await readSingleton<SiteContent>("site-content");
    const parsed = siteContentSchema.safeParse(saved || defaultSiteContent);
    if (parsed.success) {
      const legacyEtsy = process.env.NEXT_PUBLIC_ETSY_URL;
      const legacyWhatnot = process.env.NEXT_PUBLIC_WHATNOT_URL;
      return {
        ...parsed.data,
        etsyUrl: parsed.data.etsyUrl === "https://www.etsy.com/" && legacyEtsy ? legacyEtsy : parsed.data.etsyUrl,
        whatnotUrl: parsed.data.whatnotUrl === "https://www.whatnot.com/" && legacyWhatnot ? legacyWhatnot : parsed.data.whatnotUrl,
      };
    }
    console.error("Invalid site content in database; using built-in defaults.", parsed.error.flatten());
  } catch (error) {
    console.error("Could not read site content; using built-in defaults.", error);
  }
  return defaultSiteContent;
}

async function writeSiteContentNow(content: SiteContent) {
  const validated = siteContentSchema.parse(content);
  await writeSingleton("site-content", validated);
  return validated;
}

export function writeSiteContent(content: SiteContent) {
  const next = writeChain.then(() => writeSiteContentNow(content));
  writeChain = next.then(() => undefined, () => undefined);
  return next;
}
