"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { readCart, subscribeCart } from "@/lib/storefront-cart";

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
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileDrawerRef = useRef<HTMLElement | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    const update = () => setCartCount(readCart().reduce((count, item) => count + item.quantity, 0));
    update();
    return subscribeCart(update);
  }, []);

  useEffect(() => {
    function closeOnOutside(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;

      const accountMenu = accountMenuRef.current;
      if (accountMenu?.open && !accountMenu.contains(target)) accountMenu.removeAttribute("open");

      if (!mobileMenuOpen) return;
      if (mobileDrawerRef.current?.contains(target)) return;
      if (mobileMenuButtonRef.current?.contains(target)) return;
      setMobileMenuOpen(false);
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
        <Link href="/orders" onClick={() => accountMenuRef.current?.removeAttribute("open")}><span>Shop orders & STL downloads</span></Link>
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
        {[["/products", "Products"], ["/stls", "STL Files"], ["/custom-request", "Custom Printing"], ["/gallery", "Gallery"]].map(([path, label]) => (
          <Link key={path} className={`nav-tab nav-tab-compact ${active(path) ? "nav-active" : ""}`} aria-current={active(path) ? "page" : undefined} href={path}>{label}</Link>
        ))}
        {desktopAccountMenu}
        {!customer && (
          <Link className={`account-nav-link ${active("/login") ? "is-active" : ""}`} href="/login" aria-label="Sign in or create account">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M4.5 20c.9-4 3.4-6 7.5-6s6.6 2 7.5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            <span className="header-icon-label">Account</span>
          </Link>
        )}
        <Link href="/cart" className="header-cart-link" aria-label={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`} aria-current={active("/cart") ? "page" : undefined}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h2l2.3 12h11.4L21 7H6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/></svg>
          <span className="cart-count" aria-hidden="true">{cartCount}</span>
        </Link>
      </nav>

      <div className="mobile-header-bar">
        <button
          ref={mobileMenuButtonRef}
          className={`mobile-menu-button ${mobileMenuOpen ? "is-open" : ""}`}
          type="button"
          aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation-drawer"
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          <span className="mobile-menu-lines" aria-hidden="true"><i /><i /><i /></span>
        </button>

        <div className="mobile-brand-group"><button type="button" className="mobile-owner-mark" onClick={ownerTap} tabIndex={-1} aria-hidden="true"><Image src={site.logoImage} alt="" width={30} height={30} /></button><Link href="/" className="mobile-header-title" aria-label={`${site.name} home`} onClick={closeMobileMenu}>
          <span>{site.name}</span>
        </Link></div>

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
        <Link href="/cart" className="header-cart-link mobile-cart-link" aria-label={`Cart, ${cartCount} items`} onClick={closeMobileMenu}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h2l2.3 12h11.4L21 7H6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/></svg><span className="cart-count" aria-hidden="true">{cartCount}</span>
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
        ref={mobileDrawerRef}
        id="mobile-navigation-drawer"
        className={`mobile-nav-drawer ${mobileMenuOpen ? "is-open" : ""}`}
        aria-label="Mobile navigation"
        aria-hidden={!mobileMenuOpen}
        inert={!mobileMenuOpen}
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
            {[["/products", "Products"], ["/stls", "STL Files"], ["/custom-request", "Custom Printing"], ["/gallery", "Gallery"]].map(([path, label]) => (
              <Link key={path} href={path} className={`mobile-drawer-link ${active(path) ? "is-active" : ""}`} aria-current={active(path) ? "page" : undefined} onClick={closeMobileMenu}>{label}</Link>
            ))}
            <Link href="/queue" className="mobile-drawer-link" onClick={closeMobileMenu}>Print queue</Link>
          </nav>

          <div className="mobile-drawer-lower">
            {site.etsyUrl && <section className="mobile-drawer-shop">
              <span className="mobile-drawer-label">Shop</span>
              <div className="mobile-drawer-shop-grid">
                {site.etsyUrl && <a href={site.etsyUrl} target="_blank" rel="noopener noreferrer" className="mobile-drawer-shop-link" onClick={closeMobileMenu}>
                  <Image src="/brand/etsy-generated-v068.png" alt="" width={30} height={30} unoptimized />
                  <span>Etsy</span>
                </a>}
              </div>
            </section>}


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
                  <Link href="/orders" onClick={closeMobileMenu}>Shop orders & downloads</Link>
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
        </div>
      </aside>
    </div>
  );
}
