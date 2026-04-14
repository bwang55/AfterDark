import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";

const allowOrigin = process.env.ALLOW_ORIGIN || "";

function errorResponse(
  statusCode: number,
  message?: string,
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      ...(allowOrigin && {
        "access-control-allow-origin": allowOrigin,
        "access-control-allow-methods": "GET,OPTIONS",
        "access-control-allow-headers": "content-type",
      }),
    },
    body: message ? JSON.stringify({ error: message }) : "",
  };
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  // REST API handles OPTIONS/CORS preflight at the gateway level — no need here.
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return errorResponse(501, "GOOGLE_PLACES_API_KEY not configured");

  const query = event.queryStringParameters ?? {};
  const name = query.name;
  const lat = query.lat;
  const lng = query.lng;

  if (!name || !lat || !lng) {
    return errorResponse(400, "Missing params: name, lat, lng");
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
    if (!findRes.ok) return errorResponse(502, "Google API error");

    const findData = await findRes.json();
    const photoRef = findData.candidates?.[0]?.photos?.[0]
      ?.photo_reference as string | undefined;

    if (!photoRef) return errorResponse(404, "No photo found");

    // 2. Fetch photo bytes (Google redirects to CDN)
    const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=600&photo_reference=${photoRef}&key=${key}`;
    const photoRes = await fetch(photoUrl, { redirect: "follow" });
    const imageBuffer = await photoRes.arrayBuffer();

    return {
      statusCode: 200,
      headers: {
        "content-type": photoRes.headers.get("content-type") || "image/jpeg",
        "cache-control": "public, max-age=86400",
        ...(allowOrigin && {
          "access-control-allow-origin": allowOrigin,
        }),
      },
      body: Buffer.from(imageBuffer).toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error("Place photo error:", err);
    return errorResponse(502, "Failed to fetch photo");
  }
}
