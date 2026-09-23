"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
  const accountMenuRef = useRef<HTMLDetailsElement | null>(null);
  const navShellRef = useRef<HTMLDivElement | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    function closeOnOutside(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const accountMenu = accountMenuRef.current;
      if (accountMenu?.open && !accountMenu.contains(target)) accountMenu.removeAttribute("open");
      if (mobileMenuOpen && navShellRef.current && !navShellRef.current.contains(target)) setMobileMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      accountMenuRef.current?.removeAttribute("open");
      setMobileMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    setMobileMenuOpen(false);
    accountMenuRef.current?.removeAttribute("open");
  }, [pathname]);

  function active(path: string) { return path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`); }
  function closeMobileMenu() { setMobileMenuOpen(false); }
  function ownerTap() {
    const now = Date.now();
    if (!ownerTapStartedAt.current || now - ownerTapStartedAt.current > OWNER_TAP_WINDOW_MS) { ownerTapStartedAt.current = now; ownerTapCount.current = 0; }
    ownerTapCount.current += 1;
    if (ownerTapCount.current >= OWNER_TAPS) { ownerTapCount.current = 0; ownerTapStartedAt.current = 0; router.push("/login?admin=1"); }
  }
  async function signOut() {
    accountMenuRef.current?.removeAttribute("open");
    setMobileMenuOpen(false);
    await fetch("/api/account/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const accountMenu = customer ? (
    <details ref={accountMenuRef} className="account-menu account-menu-right">
      <summary className={`account-menu-trigger ${active("/profile") ? "is-active" : ""}`}>
        <span className="account-avatar" aria-hidden="true">{customer.displayName.slice(0,1).toUpperCase()}</span>
        <span className="account-name">{customer.displayName}</span>
        {customer.unreadCount > 0 && <b className="account-unread">{Math.min(customer.unreadCount, 9)}</b>}
        <svg className="account-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </summary>
      <div className="account-dropdown">
        <Link href="/profile#requests" onClick={() => { accountMenuRef.current?.removeAttribute("open"); closeMobileMenu(); }}><span>My Requests</span>{customer.unreadCount > 0 && <b>{customer.unreadCount}</b>}</Link>
        <Link href="/profile#notifications" onClick={() => { accountMenuRef.current?.removeAttribute("open"); closeMobileMenu(); }}><span>Notifications</span></Link>
        <Link href="/profile/settings" onClick={() => { accountMenuRef.current?.removeAttribute("open"); closeMobileMenu(); }}><span>Settings</span></Link>
        <button type="button" onClick={() => void signOut()}>Sign out</button>
      </div>
    </details>
  ) : null;

  return (
    <div ref={navShellRef} className="container nav-shell">
      <div className="brand-shell">
        <button className="brand-mark brand-mark-image brand-secret-trigger" type="button" onClick={ownerTap} tabIndex={-1} aria-hidden="true">
          <Image src={site.logoImage} alt="" width={38} height={38} priority />
        </button>
        <Link href="/" className="brand" aria-label={`${site.name} home`} onClick={closeMobileMenu}><span>{site.name}</span></Link>
      </div>

      <button
        className={`mobile-nav-toggle ${mobileMenuOpen ? "is-open" : ""}`}
        type="button"
        aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={mobileMenuOpen}
        aria-controls="primary-navigation"
        onClick={() => setMobileMenuOpen((open) => !open)}
      >
        <span className="mobile-nav-toggle-lines" aria-hidden="true"><i /><i /><i /></span>
        {customer && customer.unreadCount > 0 && <b className="mobile-menu-unread">{Math.min(customer.unreadCount, 9)}</b>}
      </button>

      <nav id="primary-navigation" className={`nav-links ${mobileMenuOpen ? "mobile-open" : ""}`} aria-label="Primary navigation">
        <Link onClick={closeMobileMenu} className={`nav-tab nav-tab-compact ${active("/") ? "nav-active" : ""}`} aria-current={active("/") ? "page" : undefined} href="/">Home</Link>
        <Link onClick={closeMobileMenu} className={`nav-tab nav-tab-compact ${active("/gallery") ? "nav-active" : ""}`} aria-current={active("/gallery") ? "page" : undefined} href="/gallery">Gallery</Link>
        <Link onClick={closeMobileMenu} className={`nav-tab nav-tab-compact ${active("/queue") ? "nav-active" : ""}`} aria-current={active("/queue") ? "page" : undefined} href="/queue">Queue</Link>
        <Link onClick={closeMobileMenu} className={`nav-tab nav-request-tab ${active("/custom-request") ? "nav-active" : ""}`} aria-current={active("/custom-request") ? "page" : undefined} href="/custom-request">Custom Request</Link>
        <div className="nav-shop-links" aria-label="External shops">
          <span className="mobile-shop-label">Shop</span>
          <a onClick={closeMobileMenu} className="shop-icon-image-link whatnot" href={site.whatnotUrl} target="_blank" rel="noopener noreferrer" aria-label="Shop on Whatnot (opens in a new tab)" title="Whatnot shop"><Image src="/brand/whatnot-generated-v068.png" alt="" width={30} height={30} unoptimized /></a>
          <a onClick={closeMobileMenu} className="shop-icon-image-link etsy" href={site.etsyUrl} target="_blank" rel="noopener noreferrer" aria-label="Shop on Etsy (opens in a new tab)" title="Etsy shop"><Image src="/brand/etsy-generated-v068.png" alt="" width={30} height={30} unoptimized /></a>
        </div>
        {accountMenu}
        {!customer && <Link onClick={closeMobileMenu} className={`account-nav-link ${active("/login") ? "is-active" : ""}`} href="/login"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M4.5 20c.9-4 3.4-6 7.5-6s6.6 2 7.5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg><span>Login</span></Link>}
      </nav>
    </div>
  );
}
