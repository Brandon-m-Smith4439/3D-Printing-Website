import Link from "next/link";
import { site } from "@/lib/site";

export function Header() {
  return (
    <header className="site-header">
      <div className="container nav-shell">
        <Link href="/" className="brand" aria-label={`${site.name} home`}>
          <span className="brand-mark" aria-hidden="true">L3</span>
          <span>{site.name}</span>
        </Link>
        <nav className="nav-links" aria-label="Primary navigation">
          <Link href="/gallery">Gallery</Link>
          <a href={site.etsyUrl} target="_blank" rel="noopener noreferrer">Etsy</a>
          <a href={site.whatnotUrl} target="_blank" rel="noopener noreferrer">Whatnot</a>
          <Link className="button button-small" href="/custom-request">Custom Request</Link>
        </nav>
      </div>
    </header>
  );
}
