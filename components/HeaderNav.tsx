"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef } from "react";

type HeaderNavProps = {
  site: { name: string; logoImage: string; etsyUrl: string; whatnotUrl: string };
  customer: { displayName: string; unreadCount: number } | null;
};

const OWNER_TAPS = 5;
const OWNER_TAP_WINDOW_MS = 3500;

export function HeaderNav({ site, customer }: HeaderNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const ownerTapCount = useRef(0);
  const ownerTapStartedAt = useRef(0);

  function active(path: string) { return path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`); }
  function ownerTap() {
    const now = Date.now();
    if (!ownerTapStartedAt.current || now - ownerTapStartedAt.current > OWNER_TAP_WINDOW_MS) { ownerTapStartedAt.current = now; ownerTapCount.current = 0; }
    ownerTapCount.current += 1;
    if (ownerTapCount.current >= OWNER_TAPS) { ownerTapCount.current = 0; ownerTapStartedAt.current = 0; router.push("/login?admin=1"); }
  }
  async function signOut() { await fetch("/api/account/logout", { method: "POST" }); router.push("/"); router.refresh(); }

  const accountMenu = customer ? (
    <details className="account-menu account-menu-left">
      <summary className={`account-menu-trigger ${active("/profile") ? "is-active" : ""}`}>
        <span className="account-avatar" aria-hidden="true">{customer.displayName.slice(0,1).toUpperCase()}</span>
        <span className="account-name">{customer.displayName}</span>
        {customer.unreadCount > 0 && <b className="account-unread">{Math.min(customer.unreadCount, 9)}</b>}
        <svg className="account-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </summary>
      <div className="account-dropdown">
        <Link href="/profile#requests"><span>My Requests</span>{customer.unreadCount > 0 && <b>{customer.unreadCount}</b>}</Link>
        <Link href="/profile#notifications"><span>Notifications</span></Link>
        <Link href="/profile/settings"><span>Settings</span></Link>
        <button type="button" onClick={() => void signOut()}>Sign out</button>
      </div>
    </details>
  ) : null;

  return (
    <div className="container nav-shell">
      <div className="brand-shell">
        <button className="brand-mark brand-mark-image brand-secret-trigger" type="button" onClick={ownerTap} tabIndex={-1} aria-hidden="true">
          <Image src={site.logoImage} alt="" width={38} height={38} priority />
        </button>
        <Link href="/" className="brand" aria-label={`${site.name} home`}><span>{site.name}</span></Link>
        {accountMenu}
      </div>

      <nav className="nav-links" aria-label="Primary navigation">
        <Link className={`nav-tab nav-tab-compact ${active("/") ? "nav-active" : ""}`} aria-current={active("/") ? "page" : undefined} href="/">Home</Link>
        <Link className={`nav-tab nav-tab-compact ${active("/gallery") ? "nav-active" : ""}`} aria-current={active("/gallery") ? "page" : undefined} href="/gallery">Gallery</Link>
        <Link className={`nav-tab nav-tab-compact ${active("/queue") ? "nav-active" : ""}`} aria-current={active("/queue") ? "page" : undefined} href="/queue">Queue</Link>
        <Link className={`nav-tab nav-request-tab ${active("/custom-request") ? "nav-active" : ""}`} aria-current={active("/custom-request") ? "page" : undefined} href="/custom-request">Custom Request</Link>
        <div className="nav-shop-links" aria-label="External shops">
          <a className="shop-icon-image-link whatnot" href={site.whatnotUrl} target="_blank" rel="noopener noreferrer" aria-label="Shop on Whatnot (opens in a new tab)" title="Whatnot shop"><Image src="/brand/whatnot.png" alt="" width={30} height={30} /></a>
          <a className="shop-icon-image-link etsy" href={site.etsyUrl} target="_blank" rel="noopener noreferrer" aria-label="Shop on Etsy (opens in a new tab)" title="Etsy shop"><Image src="/brand/etsy.png" alt="" width={30} height={30} /></a>
        </div>
        {!customer && (
          <Link className={`account-nav-link ${active("/login") ? "is-active" : ""}`} href="/login">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M4.5 20c.9-4 3.4-6 7.5-6s6.6 2 7.5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            <span>Login</span>
          </Link>
        )}
      </nav>
    </div>
  );
}
