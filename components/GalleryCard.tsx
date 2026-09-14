import Image from "next/image";
import type { GalleryItem } from "@/lib/site";

export function GalleryCard({ item }: { item: GalleryItem }) {
  return (
    <article className="gallery-card">
      <div className="gallery-image-wrap">
        <Image src={item.image} alt={item.title} fill sizes="(max-width: 760px) 100vw, 33vw" className="gallery-image" />
        <span className="gallery-chip">{item.category}</span>
      </div>
      <div className="gallery-card-body">
        <h3>{item.title}</h3>
        <p>{item.description}</p>
      </div>
    </article>
  );
}
