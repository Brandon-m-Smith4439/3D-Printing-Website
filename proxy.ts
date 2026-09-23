import { NextRequest, NextResponse } from "next/server";

function blockedProbeResponse() {
  return new NextResponse(null, {
    status: 404,
    headers: {
      "Cache-Control": "public, max-age=3600",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function looksLikeCommonExploitProbe(pathname: string) {
  const path = pathname.toLowerCase();

  if (
    path === "/.git" ||
    path.startsWith("/.git/") ||
    path === "/.env" ||
    path.includes("/.env") ||
    path.startsWith("/.well-known/../")
  ) {
    return true;
  }

  if (/\.php(?:$|[./~_-])/.test(path)) {
    return true;
  }

  if (
    /^\/(?:wp-admin|wp-content|wp-includes|wordpress|vendor\/phpunit|cgi-bin)(?:\/|$)/.test(path) ||
    /^\/(?:phpinfo|server-status|server-info|_profiler|_environment|actuator)(?:[/.]|$)/.test(path)
  ) {
    return true;
  }

  return false;
}

export function proxy(request: NextRequest) {
  // Mesh Harbor does not use Next.js Server Actions. Reject forged action
  // requests before Next.js attempts to resolve an attacker-supplied action ID.
  if (request.headers.has("next-action")) {
    return blockedProbeResponse();
  }

  if (looksLikeCommonExploitProbe(request.nextUrl.pathname)) {
    return blockedProbeResponse();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.png|robots.txt|sitemap.xml).*)"],
};
