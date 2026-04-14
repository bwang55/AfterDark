/**
 * AI Chat Lambda — Response Streaming via Function URL.
 *
 * Uses awslambda.streamifyResponse (Lambda runtime global) to stream
 * NDJSON chunks directly to the client. Same protocol as the local
 * Next.js API route: {t:"d",v:text}, {t:"done",text,ids,actions}.
 */

import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { MOCK_PLACES } from "../../data/mockPlaces";
import { resolveThemeByHour } from "../../shared/time-theme";

// ── DynamoDB client (reused across invocations) ───────────────────────

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const CHAT_TABLE_NAME = process.env.CHAT_TABLE_NAME || "";
const TTL_DAYS = 7;

async function writeChatMessage(
  sessionId: string,
  role: "user" | "assistant",
  text: string,
  placeIds: string[] = [],
): Promise<void> {
  if (!CHAT_TABLE_NAME || !sessionId) return;
  const now = Date.now();
  try {
    await ddb.send(
      new PutCommand({
        TableName: CHAT_TABLE_NAME,
        Item: {
          sessionId,
          timestamp: now,
          role,
          text,
          placeIds,
          ttl: Math.floor(now / 1000) + TTL_DAYS * 86400,
        },
      }),
    );
  } catch (err) {
    // Non-fatal: logging only, don't break the chat flow
    console.error("[chat-history] write failed:", err);
  }
}

// ── awslambda runtime global (streaming support) ───────────────────────

interface ResponseStream extends NodeJS.WritableStream {
  write(chunk: string | Buffer): boolean;
}

declare const awslambda: {
  streamifyResponse: (
    handler: (
      event: APIGatewayProxyEventV2,
      responseStream: ResponseStream,
      context: unknown,
    ) => Promise<void>,
  ) => (event: APIGatewayProxyEventV2, context: unknown) => Promise<void>;
  HttpResponseStream: {
    from: (
      stream: ResponseStream,
      metadata: { statusCode: number; headers: Record<string, string> },
    ) => ResponseStream;
  };
};

// ── Constants ──────────────────────────────────────────────────────────

const allowOrigin = process.env.ALLOW_ORIGIN || "*";

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

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "navigate_to_place",
      description:
        "Select a place on the map and fly the camera to it. Use when recommending a specific place.",
      parameters: {
        type: "object",
        properties: {
          placeId: { type: "string", description: "Place ID from the list" },
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
        "Change the map time. Use when the user mentions specific hours.",
      parameters: {
        type: "object",
        properties: {
          hour: { type: "number", description: "Hour 0-24. 8=8AM, 22=10PM" },
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
        "Filter map to one category. 'all' to clear.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["bars", "food", "music", "clubs", "all"],
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
      description: "Toggle filter for currently open places.",
      parameters: {
        type: "object",
        properties: { enabled: { type: "boolean" } },
        required: ["enabled"],
      },
    },
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────

function buildSystemPrompt(hour: number, openPlaceIds: string[]): string {
  const theme = resolveThemeByHour(hour);
  const personality = PERSONALITY[theme] ?? PERSONALITY.night;
  const openPlaces = MOCK_PLACES.filter((p) => openPlaceIds.includes(p.id));
  const placeLines = openPlaces
    .map((p) => `${p.id}|${p.name}|${p.category}|${p.vibeTags.join(",")}|${p.address}`)
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
        if (!validIds.has(id)) return { action: null, result: "Place not found." };
        const place = MOCK_PLACES.find((p) => p.id === id);
        return { action: { type: "navigate_to_place", placeId: id }, result: `Navigated to ${place?.name ?? id}.` };
      }
      case "set_time": {
        const h = Number(args.hour);
        if (isNaN(h)) return { action: null, result: "Invalid hour." };
        const clamped = Math.max(0, Math.min(30, h));
        return { action: { type: "set_time", hour: clamped }, result: `Time set to ${Math.floor(clamped)}:00.` };
      }
      case "filter_category": {
        const cat = args.category === "all" ? null : String(args.category ?? "");
        return { action: { type: "filter_category", category: cat }, result: cat ? `Showing ${cat}.` : "Showing all." };
      }
      case "show_open_now": {
        const on = Boolean(args.enabled);
        return { action: { type: "show_open_now", enabled: on }, result: on ? "Open only." : "Showing all." };
      }
      default:
        return { action: null, result: "Unknown tool." };
    }
  } catch {
    return { action: null, result: "Parse error." };
  }
}

// ── SSE stream reader (reusable for both OpenAI calls) ─────────────────

async function readOpenAIStream(
  body: ReadableStream<Uint8Array>,
  onDelta?: (text: string) => void,
): Promise<{
  text: string;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
}> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  const tcMap = new Map<number, { id: string; name: string; arguments: string }>();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";

    for (const line of lines) {
      const tr = line.trim();
      if (!tr.startsWith("data: ") || tr === "data: [DONE]") continue;
      try {
        const d = JSON.parse(tr.slice(6));
        const delta = d.choices?.[0]?.delta;
        if (delta?.content) {
          text += delta.content;
          onDelta?.(delta.content);
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!tcMap.has(tc.index))
              tcMap.set(tc.index, { id: "", name: "", arguments: "" });
            const e = tcMap.get(tc.index)!;
            if (tc.id) e.id = tc.id;
            if (tc.function?.name) e.name = tc.function.name;
            if (tc.function?.arguments) e.arguments += tc.function.arguments;
          }
        }
      } catch { /* skip */ }
    }
  }

  return { text, toolCalls: Array.from(tcMap.values()) };
}

// ── Streaming handler ──────────────────────────────────────────────────

export const handler = awslambda.streamifyResponse(
  async (event, responseStream, _ctx) => {
    const corsHeaders: Record<string, string> = {
      "access-control-allow-origin": allowOrigin,
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    };

    // CORS preflight
    if (event.requestContext.http.method === "OPTIONS") {
      responseStream = awslambda.HttpResponseStream.from(responseStream, {
        statusCode: 200,
        headers: corsHeaders,
      });
      responseStream.end();
      return;
    }

    // ── Validate request ──

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      responseStream = awslambda.HttpResponseStream.from(responseStream, {
        statusCode: 501,
        headers: { "content-type": "application/json", ...corsHeaders },
      });
      responseStream.write(JSON.stringify({ error: "AI chat not configured" }));
      responseStream.end();
      return;
    }

    let body: {
      message?: string;
      hour?: number;
      openPlaceIds?: string[];
      history?: { role: string; text: string }[];
      sessionId?: string;
    };
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      responseStream = awslambda.HttpResponseStream.from(responseStream, {
        statusCode: 400,
        headers: { "content-type": "application/json", ...corsHeaders },
      });
      responseStream.write(JSON.stringify({ error: "Invalid JSON" }));
      responseStream.end();
      return;
    }

    const { message: rawMsg, hour: rawHour, openPlaceIds, history, sessionId } = body;
    if (!rawMsg || typeof rawMsg !== "string" || !rawMsg.trim() || typeof rawHour !== "number") {
      responseStream = awslambda.HttpResponseStream.from(responseStream, {
        statusCode: 400,
        headers: { "content-type": "application/json", ...corsHeaders },
      });
      responseStream.write(JSON.stringify({ error: "message and hour required" }));
      responseStream.end();
      return;
    }

    const message = rawMsg.trim().slice(0, 500);
    const hour = Math.max(0, Math.min(24, rawHour));
    const validIds = new Set(
      Array.isArray(openPlaceIds)
        ? openPlaceIds.filter((id): id is string => typeof id === "string").slice(0, 50)
        : [],
    );

    const endpoint = process.env.AI_CHAT_ENDPOINT_URL || "https://api.openai.com/v1/chat/completions";
    const model = process.env.AI_CHAT_MODEL || "gpt-4o";

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: buildSystemPrompt(hour, Array.from(validIds)) },
    ];
    if (Array.isArray(history)) {
      for (const m of history.slice(-6)) {
        if (m.role === "user" || m.role === "assistant")
          messages.push({ role: m.role, content: m.text });
      }
    }
    messages.push({ role: "user", content: message });

    // ── Persist user message (fire-and-forget, non-blocking) ──

    const sid =
      typeof sessionId === "string" && sessionId.length > 0 && sessionId.length < 128
        ? sessionId
        : "";
    const writePromises: Promise<void>[] = [];
    if (sid) writePromises.push(writeChatMessage(sid, "user", message));

    // ── Start streaming response ──

    responseStream = awslambda.HttpResponseStream.from(responseStream, {
      statusCode: 200,
      headers: {
        "content-type": "application/x-ndjson",
        "cache-control": "no-cache",
        ...corsHeaders,
      },
    });

    const nd = (obj: Record<string, unknown>) =>
      responseStream.write(JSON.stringify(obj) + "\n");

    try {
      // Phase 1: first OpenAI call (streaming, with tools)
      const firstRes = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 400, stream: true, tools: TOOLS }),
        signal: AbortSignal.timeout(25000),
      });

      if (!firstRes.ok || !firstRes.body) throw new Error(`OpenAI ${firstRes.status}`);

      const first = await readOpenAIStream(firstRes.body, (delta) => {
        // Forward text deltas (only present when model doesn't use tools)
        nd({ t: "d", v: delta });
      });

      if (first.toolCalls.length > 0) {
        // Phase 2: process tool calls
        const actions: Record<string, unknown>[] = [];
        const assistantMsg: Record<string, unknown> = {
          role: "assistant",
          content: null,
          tool_calls: first.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: tc.arguments },
          })),
        };
        const toolResultMsgs: Record<string, unknown>[] = [];

        for (const tc of first.toolCalls) {
          const { action, result } = processToolCall(tc.name, tc.arguments, validIds);
          if (action) actions.push(action);
          toolResultMsgs.push({ role: "tool", tool_call_id: tc.id, content: result });
        }

        // Phase 3: second call (streaming, no tools)
        const secondRes = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [...messages, assistantMsg, ...toolResultMsgs],
            temperature: 0.7,
            max_tokens: 400,
            stream: true,
          }),
          signal: AbortSignal.timeout(25000),
        });

        if (!secondRes.ok || !secondRes.body) throw new Error(`Second call ${secondRes.status}`);

        const second = await readOpenAIStream(secondRes.body, (delta) => {
          nd({ t: "d", v: delta });
        });

        const placeIds = actions
          .filter((a) => a.type === "navigate_to_place" && validIds.has(a.placeId as string))
          .map((a) => a.placeId as string);

        nd({ t: "done", text: second.text.trim(), ids: placeIds, actions });
        if (sid) writePromises.push(writeChatMessage(sid, "assistant", second.text.trim(), placeIds));
      } else {
        // No tool calls — text already streamed via onDelta
        nd({ t: "done", text: first.text.trim(), ids: [] as string[] });
        if (sid) writePromises.push(writeChatMessage(sid, "assistant", first.text.trim(), []));
      }
    } catch (err) {
      console.error("AI chat stream error:", err);
      nd({ t: "error" });
    }

    // Flush DynamoDB writes before Lambda terminates (each already swallows errors)
    if (writePromises.length > 0) {
      await Promise.allSettled(writePromises);
    }

    responseStream.end();
  },
);
