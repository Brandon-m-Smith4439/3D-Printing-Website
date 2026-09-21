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
  wordmarkImage: localImagePath.default("/brand/mesh-harbor-3d-logo-v070.png"),
  logoAlt: z.string().trim().min(1).max(120),
  logoLetters: z.string().trim().min(1).max(4),
  businessTimeZone: z.string().trim().min(1).max(80),
  etsyUrl: externalUrl,
  whatnotUrl: externalUrl,
  galleryItems: z.array(galleryItemSchema).max(40),
});

function migrateLegacyBrand(content: SiteContent): SiteContent {
  const next = { ...content };
  // Only replace untouched LayerCraft starter values. Owner-customized values remain authoritative.
  if (next.name === "LayerCraft 3D") next.name = defaultSiteContent.name;
  if (next.tagline === "Printed with precision. Made for you.") next.tagline = defaultSiteContent.tagline;
  if (next.description === "Custom 3D prints, display pieces, functional designs, and made-to-order requests.") next.description = defaultSiteContent.description;
  if (next.logoImage === "/brand/logo.svg") next.logoImage = defaultSiteContent.logoImage;
  if (!next.wordmarkImage || next.wordmarkImage === "/brand/logo.svg") next.wordmarkImage = defaultSiteContent.wordmarkImage;
  if (next.logoAlt === "LayerCraft 3D logo") next.logoAlt = defaultSiteContent.logoAlt;
  if (next.logoLetters === "L3") next.logoLetters = defaultSiteContent.logoLetters;
  return next;
}

export async function getSiteContent(): Promise<SiteContent> {
  try {
    const saved = await readSingleton<SiteContent>("site-content");
    const parsed = siteContentSchema.safeParse(saved || defaultSiteContent);
    if (parsed.success) {
      const legacyEtsy = process.env.NEXT_PUBLIC_ETSY_URL;
      const legacyWhatnot = process.env.NEXT_PUBLIC_WHATNOT_URL;
      const branded = migrateLegacyBrand(parsed.data);
      return {
        ...branded,
        etsyUrl: branded.etsyUrl === "https://www.etsy.com/" && legacyEtsy ? legacyEtsy : branded.etsyUrl,
        whatnotUrl: branded.whatnotUrl === "https://www.whatnot.com/" && legacyWhatnot ? legacyWhatnot : branded.whatnotUrl,
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
