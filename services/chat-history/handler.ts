/**
 * Chat History Lambda — GET /chat-history?sessionId=xxx
 *
 * Returns the last N messages for a session, oldest-first, so the
 * client can hydrate the AI chat panel on page reload.
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.CHAT_TABLE_NAME || "";
const allowOrigin = process.env.ALLOW_ORIGIN || "*";

const MAX_MESSAGES = 50;

function json(statusCode: number, payload: unknown): APIGatewayProxyResultV2 {
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
    body: JSON.stringify(payload),
  };
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  // REST API handles OPTIONS/CORS preflight at the gateway level — no need here.
  if (!TABLE_NAME) {
    return json(501, { error: "Chat history not configured" });
  }

  const sessionId = event.queryStringParameters?.sessionId;
  if (!sessionId || typeof sessionId !== "string" || sessionId.length > 128) {
    return json(400, { error: "Invalid sessionId" });
  }

  try {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "sessionId = :sid",
        ExpressionAttributeValues: { ":sid": sessionId },
        ScanIndexForward: true, // oldest-first
        Limit: MAX_MESSAGES,
      }),
    );

    const messages = (res.Items ?? []).map((item) => ({
      role: item.role as "user" | "assistant",
      text: String(item.text ?? ""),
      placeIds: Array.isArray(item.placeIds) ? item.placeIds : [],
    }));

    return json(200, { messages });
  } catch (err) {
    console.error("[chat-history] query failed:", err);
    return json(502, { error: "Failed to fetch history" });
  }
}
