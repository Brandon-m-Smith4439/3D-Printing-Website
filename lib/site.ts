/**
 * V0.70 public site defaults.
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

export type ShippingOrigin = {
  name: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  country: "US";
};

export type PickupSettings = {
  enabled: boolean;
  locationName: string;
  publicArea: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  country: "US";
  instructions: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  weekdayStartTime: string;
  weekdayEndTime: string;
  weekendStartTime: string;
  weekendEndTime: string;
  slotMinutes: number;
  bookingWindowDays: number;
  minimumLeadHours: number;
};

export type SiteContent = {
  name: string;
  tagline: string;
  description: string;
  logoImage: string;
  wordmarkImage: string;
  logoAlt: string;
  logoLetters: string;
  businessTimeZone: string;
  contactEmail: string;
  etsyUrl: string;
  whatnotUrl: string;
  shippingOrigin: ShippingOrigin;
  pickup: PickupSettings;
  galleryItems: GalleryItem[];
};

export const defaultSiteContent: SiteContent = {
  name: "Mesh Harbor 3D",
  tagline: "Custom ideas, brought safely from concept to print.",
  description: "Custom 3D printing for collectibles, functional parts, prototypes, and made-to-order ideas with clear quotes and secure customer workflows.",
  logoImage: "/brand/mesh-harbor-3d-icon-v070.png",
  wordmarkImage: "/brand/mesh-harbor-3d-logo-v070.png",
  logoAlt: "Mesh Harbor 3D lighthouse, mesh, and wave emblem",
  logoLetters: "MH",
  businessTimeZone: "America/New_York",
  contactEmail: "notifications@meshharbor3d.com",
  etsyUrl: "",
  whatnotUrl: "",
  shippingOrigin: {
    name: "Mesh Harbor 3D",
    street1: "764 W Franklin St",
    street2: "",
    city: "Monroe",
    state: "NC",
    zip: "28112",
    country: "US",
  },
  pickup: {
    enabled: true,
    locationName: "Mesh Harbor 3D Local Pickup",
    publicArea: "Monroe, NC",
    street1: "316 W Jefferson St",
    street2: "",
    city: "Monroe",
    state: "NC",
    zip: "28112-4714",
    country: "US",
    instructions: "Meet at the designated Mesh Harbor 3D pickup location. The exact address is shown after scheduling. Please arrive within your reserved time window and reply to your Mesh Harbor 3D email if plans change.",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    startTime: "17:30",
    endTime: "21:00",
    weekdayStartTime: "17:30",
    weekdayEndTime: "21:00",
    weekendStartTime: "09:00",
    weekendEndTime: "20:00",
    slotMinutes: 30,
    bookingWindowDays: 14,
    minimumLeadHours: 2,
  },
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
