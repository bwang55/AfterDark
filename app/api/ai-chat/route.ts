import { NextRequest, NextResponse } from "next/server";
import { MOCK_PLACES } from "@/data/mockPlaces";
import { resolveThemeByHour } from "@/shared/time-theme";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";

// 10 requests per minute per IP — OpenAI calls are expensive
const limiter = createRateLimiter({ windowMs: 60_000, max: 10, prefix: "rl:chat" });

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

// ── OpenAI Function Calling tools ──────────────────────────────────────

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "navigate_to_place",
      description:
        "Select a place on the map and fly the camera to it. Use when recommending a specific place or when the user asks to see one.",
      parameters: {
        type: "object",
        properties: {
          placeId: {
            type: "string",
            description: "The place ID from the provided places list",
          },
        },
        required: ["placeId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_time",
      description:
        "Change the time displayed on the map. Use when the user asks about a specific time of day, e.g. 'show me tonight', 'what about morning', 'at 2am'.",
      parameters: {
        type: "object",
        properties: {
          hour: {
            type: "number",
            description:
              "Hour of day (0-24). Examples: 8 = 8 AM, 14 = 2 PM, 22 = 10 PM, 2 = 2 AM",
          },
        },
        required: ["hour"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "filter_category",
      description:
        "Filter the map to show only one category. Use when the user says 'show me bars', 'just food places', etc. Use 'all' to clear the filter.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["bars", "food", "music", "clubs", "all"],
            description:
              "Category to show, or 'all' to clear the filter and show everything",
          },
        },
        required: ["category"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "show_open_now",
      description:
        "Toggle the filter to only show places that are open at the current map time.",
      parameters: {
        type: "object",
        properties: {
          enabled: {
            type: "boolean",
            description: "true to show only open places, false to show all",
          },
        },
        required: ["enabled"],
      },
    },
  },
];

// ── System prompt builder ──────────────────────────────────────────────

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

You can interact with the map directly using your tools:
- Use navigate_to_place to highlight recommended places on the map
- Use set_time to adjust the time when the user mentions specific hours
- Use filter_category to focus the map on a specific type of venue
- Use show_open_now to filter for currently open places
Always use tools when relevant — the user sees effects instantly on their map.

Here are the places currently open in Providence. You MUST ONLY recommend from this list.
Each line is: id|name|category|vibeTags|address
---
${placeLines}
---

Keep your responses conversational and concise (2-4 sentences). Be natural and warm. When recommending places, use the navigate_to_place tool rather than listing IDs in your text.`;
}

// ── Tool call result builder ───────────────────────────────────────────

function processToolCall(
  name: string,
  argsRaw: string,
  validIds: Set<string>,
): { action: Record<string, unknown> | null; result: string } {
  try {
    const args = JSON.parse(argsRaw);
    switch (name) {
      case "navigate_to_place": {
        const id = String(args.placeId ?? "");
        if (!validIds.has(id))
          return { action: null, result: "Place not found in the current list." };
        const place = MOCK_PLACES.find((p) => p.id === id);
        return {
          action: { type: "navigate_to_place", placeId: id },
          result: `Navigated to ${place?.name ?? id}.`,
        };
      }
      case "set_time": {
        const h = Number(args.hour);
        if (isNaN(h)) return { action: null, result: "Invalid hour." };
        const clamped = Math.max(0, Math.min(30, h));
        return {
          action: { type: "set_time", hour: clamped },
          result: `Time set to ${Math.floor(clamped)}:${String(Math.round((clamped % 1) * 60)).padStart(2, "0")}.`,
        };
      }
      case "filter_category": {
        const cat = args.category === "all" ? null : String(args.category ?? "");
        return {
          action: { type: "filter_category", category: cat },
          result: cat ? `Showing only ${cat}.` : "Showing all categories.",
        };
      }
      case "show_open_now": {
        const on = Boolean(args.enabled);
        return {
          action: { type: "show_open_now", enabled: on },
          result: on ? "Showing only open places." : "Showing all places.",
        };
      }
      default:
        return { action: null, result: "Unknown tool." };
    }
  } catch {
    return { action: null, result: "Failed to parse arguments." };
  }
}

// ── POST handler ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!(await limiter.check(ip))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

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

  const { message: rawMessage, hour: rawHour, openPlaceIds, history } = body;
  if (!rawMessage || typeof rawMessage !== "string" || !rawMessage.trim()) {
    return NextResponse.json(
      { error: "Message is required" },
      { status: 400 },
    );
  }
  if (typeof rawHour !== "number") {
    return NextResponse.json(
      { error: "Hour is required" },
      { status: 400 },
    );
  }

  // Sanitize inputs
  const message = rawMessage.trim().slice(0, 500);
  const hour = Math.max(0, Math.min(24, rawHour));

  const validIds = new Set(
    Array.isArray(openPlaceIds)
      ? openPlaceIds
          .filter((id): id is string => typeof id === "string")
          .slice(0, 50)
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

  const model = process.env.AI_CHAT_MODEL || "gpt-4o";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 400,
        stream: true,
        tools: TOOLS,
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

        // Tool-call accumulation
        const toolCallMap = new Map<
          number,
          { id: string; name: string; arguments: string }
        >();

        try {
          // ── Phase 1: Stream first OpenAI response ──
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
                const delta = data.choices?.[0]?.delta;

                // Accumulate tool calls (mutually exclusive with content)
                const deltaTC = delta?.tool_calls;
                if (deltaTC) {
                  for (const tc of deltaTC) {
                    if (!toolCallMap.has(tc.index)) {
                      toolCallMap.set(tc.index, {
                        id: "",
                        name: "",
                        arguments: "",
                      });
                    }
                    const entry = toolCallMap.get(tc.index)!;
                    if (tc.id) entry.id = tc.id;
                    if (tc.function?.name) entry.name = tc.function.name;
                    if (tc.function?.arguments)
                      entry.arguments += tc.function.arguments;
                  }
                }

                // Forward text content (only present when model doesn't use tools)
                const content = delta?.content as string | undefined;
                if (!content) continue;

                accumulated += content;

                if (separatorFound) continue;

                const sepIdx = accumulated.indexOf("\n---");
                if (sepIdx >= 0) {
                  separatorFound = true;
                  const toForward = accumulated.substring(textSent, sepIdx);
                  if (toForward) {
                    controller.enqueue(
                      encoder.encode(
                        JSON.stringify({ t: "d", v: toForward }) + "\n",
                      ),
                    );
                  }
                } else {
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

          // ── Phase 2: Handle tool calls OR finalize text ──

          if (toolCallMap.size > 0) {
            // ── Tool-call path ──────────────────────────────────────
            const actions: Record<string, unknown>[] = [];
            const toolCalls = Array.from(toolCallMap.values());

            // Build assistant tool_calls message for the follow-up
            const assistantMsg: Record<string, unknown> = {
              role: "assistant",
              content: null,
              tool_calls: toolCalls.map((tc) => ({
                id: tc.id,
                type: "function",
                function: { name: tc.name, arguments: tc.arguments },
              })),
            };

            // Process each tool call → action + result
            const toolResultMsgs: {
              role: string;
              tool_call_id: string;
              content: string;
            }[] = [];

            for (const tc of toolCalls) {
              const { action, result } = processToolCall(
                tc.name,
                tc.arguments,
                validIds,
              );
              if (action) actions.push(action);
              toolResultMsgs.push({
                role: "tool",
                tool_call_id: tc.id,
                content: result,
              });
            }

            // ── Phase 3: Second OpenAI call (streaming, no tools) ──
            const secondRes = await fetch(endpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model,
                messages: [
                  ...messages,
                  assistantMsg,
                  ...toolResultMsgs,
                ],
                temperature: 0.7,
                max_tokens: 400,
                stream: true,
                // No tools → prevents recursive calling
              }),
              signal: AbortSignal.timeout(20000),
            });

            if (!secondRes.ok || !secondRes.body) {
              throw new Error(`Second call failed: ${secondRes.status}`);
            }

            const reader2 = secondRes.body.getReader();
            let sseBuffer2 = "";
            let text2 = "";

            // eslint-disable-next-line no-constant-condition
            while (true) {
              const { done, value } = await reader2.read();
              if (done) break;

              sseBuffer2 += decoder.decode(value, { stream: true });
              const lines2 = sseBuffer2.split("\n");
              sseBuffer2 = lines2.pop() || "";

              for (const l of lines2) {
                const tr = l.trim();
                if (!tr.startsWith("data: ") || tr === "data: [DONE]")
                  continue;
                try {
                  const d = JSON.parse(tr.slice(6));
                  const c = d.choices?.[0]?.delta?.content as
                    | string
                    | undefined;
                  if (c) {
                    text2 += c;
                    controller.enqueue(
                      encoder.encode(
                        JSON.stringify({ t: "d", v: c }) + "\n",
                      ),
                    );
                  }
                } catch {
                  /* skip */
                }
              }
            }

            // Extract placeIds from navigate actions
            const placeIds = actions
              .filter(
                (a) =>
                  a.type === "navigate_to_place" &&
                  validIds.has(a.placeId as string),
              )
              .map((a) => a.placeId as string);

            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  t: "done",
                  text: text2.trim(),
                  ids: placeIds,
                  actions,
                }) + "\n",
              ),
            );
          } else {
            // ── Text-only path (no tool calls) ─────────────────────
            // Flush remaining text before separator
            if (!separatorFound && textSent < accumulated.length) {
              const remaining = accumulated.substring(textSent);
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

            // Parse separator for placeIds (fallback when tools not used)
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
                JSON.stringify({
                  t: "done",
                  text: displayText,
                  ids: placeIds,
                }) + "\n",
              ),
            );
          }
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
