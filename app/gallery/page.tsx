import type { Metadata } from "next";
import Link from "next/link";
import { GalleryCard } from "@/components/GalleryCard";
import { getSiteContent } from "@/lib/site-content-store";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Examples of custom, functional, display, and prototype 3D prints.",
};

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  const { galleryItems } = await getSiteContent();
  return (
    <section className="section page-hero">
      <div className="container">
        <div className="section-heading page-heading">
          <p className="eyebrow">PROJECT GALLERY</p>
          <h1>Prints built for display, use, and everything between.</h1>
          <p>A growing collection of custom, functional, decorative, gaming, and prototype work.</p>
        </div>
        <div className="gallery-grid gallery-grid-full">
          {galleryItems.map((item) => <GalleryCard key={item.title} item={item} />)}
        </div>
        <div className="gallery-cta">
          <div>
            <p className="eyebrow">DON&apos;T SEE YOUR IDEA?</p>
            <h2>Custom projects do not have to match something already shown here.</h2>
          </div>
          <Link href="/custom-request" className="button">Request a Custom Print</Link>
        </div>
      </div>
    </section>
  );
}
