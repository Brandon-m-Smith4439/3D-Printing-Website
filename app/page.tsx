import Image from "next/image";
import Link from "next/link";
import { GalleryCard } from "@/components/GalleryCard";
import { serviceItems } from "@/lib/site";
import { getSiteContent } from "@/lib/site-content-store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const site = await getSiteContent();
  const galleryItems = site.galleryItems;
  return (
    <>
      <section className="hero section">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">CUSTOM • SMALL-BATCH • DISPLAY • FUNCTIONAL</p>
            <h1>Ideas, turned into <span>real objects.</span></h1>
            <p className="hero-text">
              Carefully produced 3D prints for collectors, workspaces, gifts, prototypes,
              replacement parts, and custom ideas that deserve more than an off-the-shelf solution.
            </p>
            <div className="hero-actions">
              <Link href="/custom-request" className="button">Request a Custom Print</Link>
              <Link href="/gallery" className="button button-secondary">View My Work</Link>
            </div>
            <div className="trust-row" aria-label="Service highlights">
              <span>Clear quotes</span><span>Material guidance</span><span>Made-to-order options</span>
            </div>
          </div>
          <div className="hero-visual mesh-harbor-hero" aria-hidden="true">
            <div className="hero-orbit orbit-one" />
            <div className="hero-orbit orbit-two" />
            <div className="mesh-brand-glow" />
            <div className="mesh-brand-card">
              <Image
                className="mesh-brand-wordmark"
                src={site.wordmarkImage}
                alt=""
                width={720}
                height={240}
                priority
                unoptimized
              />
            </div>
            <div className="harbor-wave-line harbor-wave-one" />
            <div className="harbor-wave-line harbor-wave-two" />
          </div>
        </div>
      </section>

      <section className="section section-tight">
        <div className="container store-panel">
          <div>
            <p className="eyebrow">READY TO SHOP?</p>
            <h2>Browse finished prints on the shops you already use.</h2>
            <p className="panel-copy">Checkout stays with Etsy and Whatnot while this site focuses on showcasing work and handling custom requests.</p>
          </div>
          <div className="home-shop-links">
            <a className="home-shop-link" href={site.etsyUrl} target="_blank" rel="noopener noreferrer" aria-label="Open Etsy shop in a new tab">
              <span className="home-market-icon" aria-hidden="true"><Image src="/brand/etsy-generated-v068.png" alt="" width={42} height={42} unoptimized /></span>
              <span><strong>Etsy</strong><small>Shop listings ↗</small></span>
            </a>
            <a className="home-shop-link" href={site.whatnotUrl} target="_blank" rel="noopener noreferrer" aria-label="Open Whatnot shop in a new tab">
              <span className="home-market-icon" aria-hidden="true"><Image src="/brand/whatnot-generated-v068.png" alt="" width={42} height={42} unoptimized /></span>
              <span><strong>Whatnot</strong><small>Shop & live sales ↗</small></span>
            </a>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-heading centered">
            <p className="eyebrow">WHAT I CAN MAKE</p>
            <h2>From shelf pieces to practical parts.</h2>
            <p>Not every project fits neatly into a catalog. These are the kinds of jobs this site is built to support.</p>
          </div>
          <div className="service-grid">
            {serviceItems.map((item, index) => (
              <article className="service-card" key={item.title}>
                <span className="service-number">0{index + 1}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-surface">
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
        <div className="container confidence-grid">
          <article><strong>No surprise checkout</strong><span>Custom requests are quoted and approved before becoming an order.</span></article>
          <article><strong>Material matched to use</strong><span>Heat, flex, impact, appearance, and environment can all affect the best material choice.</span></article>
          <article><strong>Your idea stays focused</strong><span>The request form collects only the details needed to evaluate and quote the project.</span></article>
        </div>
      </section>

      <section className="section section-tight-bottom">
        <div className="container cta-panel">
          <div><p className="eyebrow">HAVE SOMETHING SPECIFIC IN MIND?</p><h2>Let’s see if we can print it.</h2></div>
          <Link href="/custom-request" className="button">Start a Custom Request</Link>
        </div>
      </section>
    </>
  );
}
