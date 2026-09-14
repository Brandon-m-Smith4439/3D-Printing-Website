import Link from "next/link";
import { site } from "@/lib/site";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <div className="brand footer-brand">
            <span className="brand-mark" aria-hidden="true">L3</span>
            <span>{site.name}</span>
          </div>
          <p className="muted">Small-batch and custom 3D printing with a focus on clean results and clear communication.</p>
        </div>
        <div className="footer-links">
          <Link href="/gallery">Gallery</Link>
          <Link href="/custom-request">Custom Request</Link>
          <Link href="/privacy">Privacy</Link>
          <a href={site.etsyUrl} target="_blank" rel="noopener noreferrer">Etsy Shop</a>
          <a href={site.whatnotUrl} target="_blank" rel="noopener noreferrer">Whatnot Shop</a>
        </div>
      </div>
      <div className="container footer-bottom">© {new Date().getFullYear()} {site.name}. All rights reserved.</div>
    </footer>
  );
}
