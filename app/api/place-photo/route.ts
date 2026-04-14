import { NextRequest, NextResponse } from "next/server";

// Simple in-memory cache: placeKey → photoUrl (Google's CDN URL)
const cache = new Map<string, string | null>();

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const name = sp.get("name");
  const lat = sp.get("lat");
  const lng = sp.get("lng");

  if (!name || !lat || !lng) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "GOOGLE_PLACES_API_KEY not configured" },
      { status: 501 },
    );
  }

  const cacheKey = `${name}|${lat}|${lng}`;

  // Check cache
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (!cached) return new NextResponse(null, { status: 404 });
    return NextResponse.redirect(cached, {
      headers: { "Cache-Control": "public, max-age=86400" },
    });
  }

  try {
    // 1. Find place via Google Places API
    const findUrl = new URL(
      "https://maps.googleapis.com/maps/api/place/findplacefromtext/json",
    );
    findUrl.searchParams.set("input", `${name} Providence RI`);
    findUrl.searchParams.set("inputtype", "textquery");
    findUrl.searchParams.set("fields", "photos");
    findUrl.searchParams.set("locationbias", `point:${lat},${lng}`);
    findUrl.searchParams.set("key", key);

    const findRes = await fetch(findUrl.toString());
    if (!findRes.ok) {
      return new NextResponse(null, { status: 502 });
    }
    const findData = await findRes.json();

    const photoRef =
      findData.candidates?.[0]?.photos?.[0]?.photo_reference as
        | string
        | undefined;

    if (!photoRef) {
      cache.set(cacheKey, null);
      return new NextResponse(null, { status: 404 });
    }

    // 2. Fetch photo (Google redirects to a CDN url)
    const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=600&photo_reference=${photoRef}&key=${key}`;
    const photoRes = await fetch(photoUrl, { redirect: "follow" });

    // The final URL after redirect is a public CDN link we can cache & return
    const finalUrl = photoRes.url;
    cache.set(cacheKey, finalUrl);

    // Proxy the image bytes so the Google key is never exposed to the client
    const imageBytes = await photoRes.arrayBuffer();
    return new NextResponse(imageBytes, {
      headers: {
        "Content-Type": photoRes.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
