import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { createPasswordVerifier } from "@/lib/basic-auth";

const verifyPassword = createPasswordVerifier();

export const config = {
  // Public assets skip the proxy; page, API, and Next.js data requests still authenticate.
  matcher: "/((?!_next/static/|images/|favicon\\.ico$|icon\\.svg$).*)",
};

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/health") return NextResponse.next();

  const username = process.env.BASIC_AUTH_USER;
  const passwordHash = process.env.BASIC_AUTH_HASH;

  if (!username && !passwordHash && process.env.NODE_ENV === "development") {
    return NextResponse.next();
  }

  if (!username || username.includes(":") || !passwordHash || !/^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$/.test(passwordHash)) {
    return new NextResponse("Authentication is not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const encoded = request.headers.get("authorization")?.match(/^Basic ([A-Za-z0-9+/]+={0,2})$/i)?.[1];
  if (encoded) {
    const supplied = Buffer.from(encoded, "base64").toString("utf8");
    const separator = supplied.indexOf(":");
    const usernameMatches = separator >= 0 && timingSafeEqual(
      createHash("sha256").update(supplied.slice(0, separator)).digest(),
      createHash("sha256").update(username).digest(),
    );
    if (usernameMatches && await verifyPassword(supplied.slice(separator + 1), username, passwordHash)) {
      const response = NextResponse.next();
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Thruput Explorer", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}
