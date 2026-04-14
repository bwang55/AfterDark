import { NextRequest, NextResponse } from "next/server";
import { MOCK_PLACES } from "@/data/mockPlaces";
import { resolveThemeByHour } from "@/shared/time-theme";

const PERSONALITY: Record<string, string> = {
  morning:
    "Right now it's morning. Be encouraging and uplifting. Suggest energizing options — coffee spots, brunch places, good walks. Your vibe is sunny and optimistic.",
  afternoon:
    "Right now it's afternoon. Be warm and enthusiastic. Suggest lunch spots, afternoon hangs, and places to recharge. Your vibe is friendly and active.",
  dusk:
    "Right now it's dusk — the golden hour. Build anticipation for the evening. Suggest dinner spots, places to catch the last light, early-evening plans. Your vibe is warm and anticipatory.",
  night:
    "Right now it's late night. Offer emotional support, cozy recommendations, and winding-down vibes. Your vibe is intimate and gentle. If the user seems tired or emotional, validate their feelings before suggesting a spot.",
};

function buildSystemPrompt(hour: number, openPlaceIds: string[]): string {
  const theme = resolveThemeByHour(hour);
  const personality = PERSONALITY[theme] ?? PERSONALITY.night;

  const openPlaces = MOCK_PLACES.filter((p) => openPlaceIds.includes(p.id));
  const placeLines = openPlaces
    .map(
      (p) =>
        `${p.id}|${p.name}|${p.category}|${p.vibeTags.join(",")}|${p.address}`,
    )
    .join("\n");

  return `You are AfterDark, a nightlife and city discovery assistant for Providence, RI. You speak in a warm, personal, conversational tone — like a knowledgeable local friend. Keep responses in the same language the user writes in.

${personality}

Here are the places currently open in Providence. You MUST ONLY recommend from this list.
Each line is: id|name|category|vibeTags|address
---
${placeLines}
---

Response format:
1. Write your conversational response (2-4 sentences). Be natural and warm.
2. Then write a line containing ONLY three dashes: ---
3. Then write the place IDs you recommend, separated by commas (1-3 IDs from the list above).
4. If no places match, write "none" after the separator.

Example:
I think you'd love somewhere with low lights tonight. The Avery has this beautiful candlelit vibe that's perfect for winding down.
---
p01

Important: Always include the --- separator line. Never skip it. Never put place IDs in the text portion.`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI chat not configured" },
      { status: 501 },
    );
  }

  let body: {
    message?: string;
    hour?: number;
    openPlaceIds?: string[];
    history?: { role: string; text: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message, hour, openPlaceIds, history } = body;
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json(
      { error: "Message is required" },
      { status: 400 },
    );
  }
  if (typeof hour !== "number") {
    return NextResponse.json(
      { error: "Hour is required" },
      { status: 400 },
    );
  }

  const validIds = new Set(
    Array.isArray(openPlaceIds)
      ? openPlaceIds.filter((id): id is string => typeof id === "string")
      : [],
  );

  const systemPrompt = buildSystemPrompt(hour, Array.from(validIds));
  const endpoint =
    process.env.AI_CHAT_ENDPOINT_URL ||
    "https://api.openai.com/v1/chat/completions";

  // Build messages with conversation history
  const messages: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];
  if (Array.isArray(history)) {
    for (const m of history.slice(-6)) {
      if (m.role === "user" || m.role === "assistant") {
        messages.push({ role: m.role, content: m.text });
      }
    }
  }
  messages.push({ role: "user", content: message.trim() });

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.AI_CHAT_MODEL || "gpt-4o-mini",
        messages,
        temperature: 0.7,
        max_tokens: 400,
        stream: true,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok || !res.body) {
      const errBody = await res.text().catch(() => "");
      console.error("OpenAI API error:", res.status, errBody);
      return NextResponse.json(
        { error: "AI service unavailable" },
        { status: 502 },
      );
    }

    // Stream OpenAI SSE → NDJSON to client
    const openaiReader = res.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let accumulated = "";
        let textSent = 0;
        let separatorFound = false;
        let sseBuffer = "";

        try {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await openaiReader.read();
            if (done) break;

            sseBuffer += decoder.decode(value, { stream: true });
            const lines = sseBuffer.split("\n");
            sseBuffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (
                !trimmed.startsWith("data: ") ||
                trimmed === "data: [DONE]"
              )
                continue;

              try {
                const data = JSON.parse(trimmed.slice(6));
                const content = data.choices?.[0]?.delta?.content as
                  | string
                  | undefined;
                if (!content) continue;

                accumulated += content;

                if (separatorFound) continue; // after separator — don't forward

                const sepIdx = accumulated.indexOf("\n---");
                if (sepIdx >= 0) {
                  separatorFound = true;
                  // Forward any text in this delta that's before the separator
                  const toForward = accumulated.substring(textSent, sepIdx);
                  if (toForward) {
                    controller.enqueue(
                      encoder.encode(
                        JSON.stringify({ t: "d", v: toForward }) + "\n",
                      ),
                    );
                  }
                } else {
                  // Forward delta, but hold back last 4 chars (possible partial separator)
                  const safeEnd = Math.max(
                    textSent,
                    accumulated.length - 4,
                  );
                  const toForward = accumulated.substring(textSent, safeEnd);
                  if (toForward) {
                    controller.enqueue(
                      encoder.encode(
                        JSON.stringify({ t: "d", v: toForward }) + "\n",
                      ),
                    );
                    textSent = safeEnd;
                  }
                }
              } catch {
                // skip malformed SSE data
              }
            }
          }

          // Flush any remaining text before separator
          if (!separatorFound && textSent < accumulated.length) {
            const remaining = accumulated.substring(textSent);
            // Check one more time for separator in remaining
            const sepIdx = remaining.indexOf("\n---");
            if (sepIdx >= 0) {
              separatorFound = true;
              const toForward = remaining.substring(0, sepIdx);
              if (toForward) {
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({ t: "d", v: toForward }) + "\n",
                  ),
                );
              }
            } else if (remaining) {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({ t: "d", v: remaining }) + "\n",
                ),
              );
            }
          }

          // Parse accumulated text for separator and place IDs
          const sepIdx = accumulated.indexOf("\n---");
          let displayText: string;
          let placeIds: string[];

          if (sepIdx >= 0) {
            displayText = accumulated.substring(0, sepIdx).trim();
            const idsStr = accumulated
              .substring(sepIdx + 4)
              .replace(/^[\s\n-]+/, "")
              .trim();
            placeIds = idsStr
              .split(/[,\s]+/)
              .map((s) => s.trim())
              .filter((id) => id && id !== "none" && validIds.has(id));
          } else {
            displayText = accumulated.trim();
            placeIds = [];
          }

          controller.enqueue(
            encoder.encode(
              JSON.stringify({ t: "done", text: displayText, ids: placeIds }) +
                "\n",
            ),
          );
        } catch (err) {
          console.error("Stream error:", err);
          controller.enqueue(
            encoder.encode(JSON.stringify({ t: "error" }) + "\n"),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("AI chat error:", err);
    return NextResponse.json(
      { error: "AI service unavailable" },
      { status: 502 },
    );
  }
}
