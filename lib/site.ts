export const site = {
  name: "LayerCraft 3D",
  tagline: "Printed with precision. Made for you.",
  description:
    "Custom 3D prints, display pieces, functional designs, and made-to-order requests.",
  etsyUrl: process.env.NEXT_PUBLIC_ETSY_URL || "https://www.etsy.com/",
  whatnotUrl: process.env.NEXT_PUBLIC_WHATNOT_URL || "https://www.whatnot.com/",
};

export type GalleryItem = {
  title: string;
  category: string;
  description: string;
  image: string;
  featured?: boolean;
};

export const galleryItems: GalleryItem[] = [
  {
    title: "Character Display Print",
    category: "Display",
    description: "Multi-part display print with clean detail and a presentation-ready finish.",
    image: "/sample-display.svg",
    featured: true,
  },
  {
    title: "Custom Desk Organizer",
    category: "Functional",
    description: "Purpose-built organization with dimensions tailored to the workspace.",
    image: "/sample-organizer.svg",
  },
  {
    title: "Layered Wall Art",
    category: "Decor",
    description: "Dimensional wall piece designed around color, depth, and clean layer changes.",
    image: "/sample-wall-art.svg",
  },
  {
    title: "Controller Stand",
    category: "Gaming",
    description: "Stable, compact stand built to keep a gaming setup clean and organized.",
    image: "/sample-controller.svg",
  },
  {
    title: "Prototype Part",
    category: "Custom",
    description: "A practical prototype used to validate fit, size, and geometry before a final run.",
    image: "/sample-prototype.svg",
  },
  {
    title: "Collectible Display Base",
    category: "Display",
    description: "A custom base designed to elevate and organize collectible pieces.",
    image: "/sample-base.svg",
  },
];
