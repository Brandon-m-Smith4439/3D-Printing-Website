import type { Metadata } from "next";
import Link from "next/link";
import { GalleryCard } from "@/components/GalleryCard";
import { galleryItems } from "@/lib/site";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Examples of custom, functional, display, and prototype 3D prints.",
};

export default function GalleryPage() {
  return (
    <section className="section page-hero">
      <div className="container">
        <div className="section-heading page-heading">
          <p className="eyebrow">PROJECT GALLERY</p>
          <h1>Prints built for display, use, and everything between.</h1>
          <p>Replace these starter images and descriptions with your own work. The layout is already ready for a growing portfolio.</p>
        </div>
        <div className="gallery-grid gallery-grid-full">
          {galleryItems.map((item) => <GalleryCard key={item.title} item={item} />)}
        </div>
        <div className="gallery-cta">
          <h2>Want something made for you?</h2>
          <Link href="/custom-request" className="button">Request a Custom Print</Link>
        </div>
      </div>
    </section>
  );
}
