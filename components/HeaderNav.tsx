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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    function closeOnOutside(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const accountMenu = accountMenuRef.current;
      if (accountMenu?.open && !accountMenu.contains(target)) accountMenu.removeAttribute("open");
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
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
    accountMenuRef.current?.removeAttribute("open");
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  function active(path: string) {
    return path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);
  }

  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }

  function ownerTap() {
    const now = Date.now();
    if (!ownerTapStartedAt.current || now - ownerTapStartedAt.current > OWNER_TAP_WINDOW_MS) {
      ownerTapStartedAt.current = now;
      ownerTapCount.current = 0;
    }
    ownerTapCount.current += 1;
    if (ownerTapCount.current >= OWNER_TAPS) {
      ownerTapCount.current = 0;
      ownerTapStartedAt.current = 0;
      router.push("/login?admin=1");
    }
  }

  async function signOut() {
    accountMenuRef.current?.removeAttribute("open");
    setMobileMenuOpen(false);
    await fetch("/api/account/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const desktopAccountMenu = customer ? (
    <details ref={accountMenuRef} className="account-menu account-menu-right">
      <summary className={`account-menu-trigger ${active("/profile") ? "is-active" : ""}`}>
        <span className="account-avatar" aria-hidden="true">{customer.displayName.slice(0, 1).toUpperCase()}</span>
        <span className="account-name">{customer.displayName}</span>
        {customer.unreadCount > 0 && <b className="account-unread">{Math.min(customer.unreadCount, 9)}</b>}
        <svg className="account-chevron" viewBox="0 0 20 20" aria-hidden="true">
          <path d="m5 7 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="account-dropdown">
        <Link href="/profile#requests" onClick={() => accountMenuRef.current?.removeAttribute("open")}>
          <span>My Requests</span>
          {customer.unreadCount > 0 && <b>{customer.unreadCount}</b>}
        </Link>
        <Link href="/profile#notifications" onClick={() => accountMenuRef.current?.removeAttribute("open")}><span>Notifications</span></Link>
        <Link href="/profile/settings" onClick={() => accountMenuRef.current?.removeAttribute("open")}><span>Settings</span></Link>
        <button type="button" onClick={() => void signOut()}>Sign out</button>
      </div>
    </details>
  ) : null;

  return (
    <div className="container nav-shell">
      <div className="brand-shell desktop-brand-shell">
        <button className="brand-mark brand-mark-image brand-secret-trigger" type="button" onClick={ownerTap} tabIndex={-1} aria-hidden="true">
          <Image src={site.logoImage} alt="" width={38} height={38} priority />
        </button>
        <Link href="/" className="brand" aria-label={`${site.name} home`}><span>{site.name}</span></Link>
      </div>

      <nav className="nav-links desktop-nav-links" aria-label="Primary navigation">
        <Link className={`nav-tab nav-tab-compact ${active("/") ? "nav-active" : ""}`} aria-current={active("/") ? "page" : undefined} href="/">Home</Link>
        <Link className={`nav-tab nav-tab-compact ${active("/gallery") ? "nav-active" : ""}`} aria-current={active("/gallery") ? "page" : undefined} href="/gallery">Gallery</Link>
        <Link className={`nav-tab nav-tab-compact ${active("/queue") ? "nav-active" : ""}`} aria-current={active("/queue") ? "page" : undefined} href="/queue">Queue</Link>
        <Link className={`nav-tab nav-request-tab ${active("/custom-request") ? "nav-active" : ""}`} aria-current={active("/custom-request") ? "page" : undefined} href="/custom-request">Custom Request</Link>
        <div className="nav-shop-links" aria-label="External shops">
          <a className="shop-icon-image-link whatnot" href={site.whatnotUrl} target="_blank" rel="noopener noreferrer" aria-label="Shop on Whatnot (opens in a new tab)" title="Whatnot shop">
            <Image src="/brand/whatnot-generated-v068.png" alt="" width={30} height={30} unoptimized />
          </a>
          <a className="shop-icon-image-link etsy" href={site.etsyUrl} target="_blank" rel="noopener noreferrer" aria-label="Shop on Etsy (opens in a new tab)" title="Etsy shop">
            <Image src="/brand/etsy-generated-v068.png" alt="" width={30} height={30} unoptimized />
          </a>
        </div>
        {desktopAccountMenu}
        {!customer && (
          <Link className={`account-nav-link ${active("/login") ? "is-active" : ""}`} href="/login">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M4.5 20c.9-4 3.4-6 7.5-6s6.6 2 7.5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            <span>Login</span>
          </Link>
        )}
      </nav>

      <div className="mobile-header-bar">
        <button
          className={`mobile-menu-button ${mobileMenuOpen ? "is-open" : ""}`}
          type="button"
          aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation-drawer"
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          <span className="mobile-menu-lines" aria-hidden="true"><i /><i /><i /></span>
        </button>

        <Link href="/" className="mobile-header-title" aria-label={`${site.name} home`} onClick={closeMobileMenu}>
          {site.name}
        </Link>

        <Link
          href={customer ? "/profile" : "/login"}
          className={`mobile-profile-button ${customer ? "is-customer" : ""} ${active(customer ? "/profile" : "/login") ? "is-active" : ""}`}
          aria-label={customer ? `Open ${customer.displayName}'s profile` : "Login or create account"}
          onClick={closeMobileMenu}
        >
          {customer ? (
            <span className="mobile-profile-avatar" aria-hidden="true">{customer.displayName.slice(0, 1).toUpperCase()}</span>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M4.5 20c.9-4 3.4-6 7.5-6s6.6 2 7.5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          )}
          {customer && customer.unreadCount > 0 && <b className="mobile-profile-unread">{Math.min(customer.unreadCount, 9)}</b>}
        </Link>
      </div>

      <button
        type="button"
        className={`mobile-drawer-backdrop ${mobileMenuOpen ? "is-visible" : ""}`}
        aria-label="Close navigation menu"
        tabIndex={mobileMenuOpen ? 0 : -1}
        onClick={closeMobileMenu}
      />

      <aside
        id="mobile-navigation-drawer"
        className={`mobile-nav-drawer ${mobileMenuOpen ? "is-open" : ""}`}
        aria-label="Mobile navigation"
        aria-hidden={!mobileMenuOpen}
      >
        <div className="mobile-drawer-top">
          <Link href="/" className="mobile-drawer-brand" onClick={closeMobileMenu}>
            <span className="mobile-drawer-logo">
              <Image src={site.logoImage} alt="" width={42} height={42} priority />
            </span>
            <span className="mobile-drawer-brand-copy">
              <small>Welcome to</small>
              <strong>{site.name}</strong>
            </span>
          </Link>
          <button className="mobile-drawer-close" type="button" onClick={closeMobileMenu} aria-label="Close navigation menu">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6 18 18M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="mobile-drawer-content">
          <nav className="mobile-drawer-nav" aria-label="Mobile primary navigation">
            <Link href="/" className={`mobile-drawer-link ${active("/") ? "is-active" : ""}`} onClick={closeMobileMenu}>Home</Link>
            <Link href="/gallery" className={`mobile-drawer-link ${active("/gallery") ? "is-active" : ""}`} onClick={closeMobileMenu}>Gallery</Link>
            <Link href="/queue" className={`mobile-drawer-link ${active("/queue") ? "is-active" : ""}`} onClick={closeMobileMenu}>Queue</Link>
            <Link href="/custom-request" className={`mobile-drawer-link mobile-drawer-primary ${active("/custom-request") ? "is-active" : ""}`} onClick={closeMobileMenu}>Custom Request</Link>
          </nav>

          <section className="mobile-drawer-shop">
            <span className="mobile-drawer-label">Shop</span>
            <div className="mobile-drawer-shop-grid">
              <a href={site.whatnotUrl} target="_blank" rel="noopener noreferrer" className="mobile-drawer-shop-link" onClick={closeMobileMenu}>
                <Image src="/brand/whatnot-generated-v068.png" alt="" width={30} height={30} unoptimized />
                <span>Whatnot</span>
              </a>
              <a href={site.etsyUrl} target="_blank" rel="noopener noreferrer" className="mobile-drawer-shop-link" onClick={closeMobileMenu}>
                <Image src="/brand/etsy-generated-v068.png" alt="" width={30} height={30} unoptimized />
                <span>Etsy</span>
              </a>
            </div>
          </section>

          <div className="mobile-drawer-account">
            {customer ? (
              <>
                <Link href="/profile" className="mobile-drawer-customer" onClick={closeMobileMenu}>
                  <span className="mobile-drawer-avatar" aria-hidden="true">{customer.displayName.slice(0, 1).toUpperCase()}</span>
                  <span className="mobile-drawer-customer-copy">
                    <strong>{customer.displayName}</strong>
                    <small>{customer.unreadCount > 0 ? `${customer.unreadCount} unread notification${customer.unreadCount === 1 ? "" : "s"}` : "View your profile"}</small>
                  </span>
                </Link>
                <div className="mobile-drawer-account-actions">
                  <Link href="/profile#requests" onClick={closeMobileMenu}>My Requests</Link>
                  <Link href="/profile/settings" onClick={closeMobileMenu}>Settings</Link>
                  <button type="button" onClick={() => void signOut()}>Sign out</button>
                </div>
              </>
            ) : (
              <>
                <span className="mobile-drawer-label">Account</span>
                <div className="mobile-drawer-auth-actions">
                  <Link href="/login" className="mobile-drawer-login" onClick={closeMobileMenu}>Login</Link>
                  <Link href="/login?mode=register" className="mobile-drawer-register" onClick={closeMobileMenu}>Create account</Link>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
