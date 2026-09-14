import Link from "next/link";
import { GalleryCard } from "@/components/GalleryCard";
import { galleryItems, site } from "@/lib/site";

export default function HomePage() {
  return (
    <>
      <section className="hero section">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">CUSTOM • SMALL-BATCH • DISPLAY • FUNCTIONAL</p>
            <h1>Ideas, turned into <span>real objects.</span></h1>
            <p className="hero-text">
              Clean, carefully produced 3D prints for collectors, workspaces, gifts, prototypes, replacement parts, and one-off ideas.
            </p>
            <div className="hero-actions">
              <Link href="/custom-request" className="button">Request a Custom Print</Link>
              <Link href="/gallery" className="button button-secondary">View My Work</Link>
            </div>
            <div className="trust-row" aria-label="Service highlights">
              <span>Clear quotes</span><span>Material guidance</span><span>Progress communication</span>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="hero-orbit orbit-one" />
            <div className="hero-orbit orbit-two" />
            <div className="print-cube">
              <div className="cube-face cube-front">L3</div>
              <div className="cube-face cube-top" />
              <div className="cube-face cube-side" />
            </div>
            <div className="layer-lines" />
          </div>
        </div>
      </section>

      <section className="section section-tight">
        <div className="container store-panel">
          <div>
            <p className="eyebrow">READY TO SHOP?</p>
            <h2>Browse finished prints on the shops you already use.</h2>
          </div>
          <div className="store-actions">
            <a className="store-button" href={site.etsyUrl} target="_blank" rel="noopener noreferrer">
              <strong>Etsy</strong><span>Shop listings ↗</span>
            </a>
            <a className="store-button" href={site.whatnotUrl} target="_blank" rel="noopener noreferrer">
              <strong>Whatnot</strong><span>Shop & live sales ↗</span>
            </a>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-heading split-heading">
            <div><p className="eyebrow">RECENT WORK</p><h2>Made layer by layer.</h2></div>
            <Link href="/gallery" className="text-link">See full gallery →</Link>
          </div>
          <div className="gallery-grid">
            {galleryItems.slice(0, 3).map((item) => <GalleryCard key={item.title} item={item} />)}
          </div>
        </div>
      </section>

      <section className="section process-section">
        <div className="container">
          <div className="section-heading centered">
            <p className="eyebrow">CUSTOM REQUESTS</p>
            <h2>Simple from idea to print.</h2>
            <p>Send the details first. I’ll review feasibility, material, size, timing, and pricing before anything is treated as an order.</p>
          </div>
          <div className="process-grid">
            <article><span>01</span><h3>Describe it</h3><p>Tell me what you need and share a reference link if you have one.</p></article>
            <article><span>02</span><h3>Review & quote</h3><p>I’ll confirm the design approach, material, timing, and expected price.</p></article>
            <article><span>03</span><h3>Print & finish</h3><p>Once approved, the job moves into production and finishing.</p></article>
            <article><span>04</span><h3>Pickup or shipping</h3><p>We’ll coordinate the final handoff after the print is completed.</p></article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container cta-panel">
          <div><p className="eyebrow">HAVE SOMETHING SPECIFIC IN MIND?</p><h2>Let’s see if we can print it.</h2></div>
          <Link href="/custom-request" className="button">Start a Custom Request</Link>
        </div>
      </section>
    </>
  );
}
