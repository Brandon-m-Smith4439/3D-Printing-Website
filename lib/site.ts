/**
 * V0.61 public site defaults.
 *
 * These values are now editable from /owner -> Site Content. The owner editor
 * persists overrides to data/site-content.json. Keeping defaults here means a
 * fresh checkout still has a complete working website.
 */
export type GalleryItem = {
  id: string;
  title: string;
  category: string;
  description: string;
  image: string;
  featured?: boolean;
};

export type SiteContent = {
  name: string;
  tagline: string;
  description: string;
  logoImage: string;
  logoAlt: string;
  logoLetters: string;
  businessTimeZone: string;
  etsyUrl: string;
  whatnotUrl: string;
  galleryItems: GalleryItem[];
};

export const defaultSiteContent: SiteContent = {
  name: "LayerCraft 3D",
  tagline: "Printed with precision. Made for you.",
  description: "Custom 3D prints, display pieces, functional designs, and made-to-order requests.",
  logoImage: "/brand/logo.svg",
  logoAlt: "LayerCraft 3D logo",
  logoLetters: "L3",
  businessTimeZone: "America/New_York",
  etsyUrl: "https://www.etsy.com/",
  whatnotUrl: "https://www.whatnot.com/",
  galleryItems: [
    {
      id: "display-character",
      title: "Character Display Print",
      category: "Display",
      description: "Multi-part display print with clean detail and a presentation-ready finish.",
      image: "/sample-display.svg",
      featured: true,
    },
    {
      id: "desk-organizer",
      title: "Custom Desk Organizer",
      category: "Functional",
      description: "Purpose-built organization with dimensions tailored to the workspace.",
      image: "/sample-organizer.svg",
    },
    {
      id: "wall-art",
      title: "Layered Wall Art",
      category: "Decor",
      description: "Dimensional wall piece designed around color, depth, and clean layer changes.",
      image: "/sample-wall-art.svg",
    },
    {
      id: "controller-stand",
      title: "Controller Stand",
      category: "Gaming",
      description: "Stable, compact stand built to keep a gaming setup clean and organized.",
      image: "/sample-controller.svg",
    },
    {
      id: "prototype-part",
      title: "Prototype Part",
      category: "Custom",
      description: "A practical prototype used to validate fit, size, and geometry before a final run.",
      image: "/sample-prototype.svg",
    },
    {
      id: "display-base",
      title: "Collectible Display Base",
      category: "Display",
      description: "A custom base designed to elevate and organize collectible pieces.",
      image: "/sample-base.svg",
    },
  ],
};

// Compatibility fallback for code that only needs stable business settings.
export const site = defaultSiteContent;
export const galleryItems = defaultSiteContent.galleryItems;

export const serviceItems = [
  {
    title: "Display & collectibles",
    description: "Shelf pieces, character displays, stands, props, decorative prints, and gifts.",
  },
  {
    title: "Functional prints",
    description: "Organizers, brackets, holders, adapters, replacement pieces, and everyday solutions.",
  },
  {
    title: "Prototypes & one-offs",
    description: "Test-fit parts and custom ideas where dimensions, iteration, and practicality matter.",
  },
  {
    title: "Small-batch printing",
    description: "Short production runs for events, gifts, small businesses, clubs, and repeat needs.",
  },
];
