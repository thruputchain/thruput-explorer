import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/health") return NextResponse.next();

  const username = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;

  if (!username && !password && process.env.NODE_ENV === "development") {
    return NextResponse.next();
  }

  if (!username || !password || username.includes(":")) {
    return new NextResponse("Authentication is not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const encoded = request.headers.get("authorization")?.match(/^Basic ([A-Za-z0-9+/]+={0,2})$/i)?.[1];
  if (encoded) {
    const supplied = Buffer.from(encoded, "base64");
    const expected = Buffer.from(`${username}:${password}`, "utf8");
    // Fixed-length digests avoid leaking credential lengths during comparison.
    if (timingSafeEqual(createHash("sha256").update(supplied).digest(), createHash("sha256").update(expected).digest())) {
      const response = NextResponse.next();
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Groundhog Explorer", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}
