import path from "node:path";

import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import {
  Cors,
  LambdaIntegration,
  MethodLoggingLevel,
  RestApi,
} from "aws-cdk-lib/aws-apigateway";
import {
  AttributeType,
  BillingMode,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import {
  FunctionUrlAuthType,
  HttpMethod,
  InvokeMode,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

export class AfterDarkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const allowedOrigins = process.env.ALLOW_ORIGIN
      ? process.env.ALLOW_ORIGIN.split(",")
      : Cors.ALL_ORIGINS;

    const corsOptions = {
      allowOrigins: allowedOrigins,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["content-type", "authorization"],
    };

    // ── DynamoDB: AI chat history ────────────────────────────────────

    const chatTable = new Table(this, "ChatHistoryTable", {
      partitionKey: { name: "sessionId", type: AttributeType.STRING },
      sortKey: { name: "timestamp", type: AttributeType.NUMBER },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // ── Lambda: GET /places ──────────────────────────────────────────

    const placesHandler = new NodejsFunction(this, "PlacesHandler", {
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(12),
      memorySize: 512,
      entry: path.join(__dirname, "../../services/api/handler.ts"),
      handler: "handler",
      bundling: {
        sourceMap: true,
        minify: true,
        target: "node20",
      },
      environment: {
        ALLOW_ORIGIN: process.env.ALLOW_ORIGIN ?? "",
        MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN ?? "",
      },
    });

    // ── Lambda: POST /ai-chat ────────────────────────────────────────

    const aiChatHandler = new NodejsFunction(this, "AiChatHandler", {
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      entry: path.join(__dirname, "../../services/ai-chat/handler.ts"),
      handler: "handler",
      bundling: {
        sourceMap: true,
        minify: true,
        target: "node20",
      },
      environment: {
        ALLOW_ORIGIN: process.env.ALLOW_ORIGIN ?? "",
        OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
        AI_CHAT_MODEL: process.env.AI_CHAT_MODEL ?? "gpt-4o",
        AI_CHAT_ENDPOINT_URL: process.env.AI_CHAT_ENDPOINT_URL ?? "",
        CHAT_TABLE_NAME: chatTable.tableName,
      },
    });
    chatTable.grantWriteData(aiChatHandler);

    // ── Lambda: GET /chat-history ────────────────────────────────────

    const chatHistoryHandler = new NodejsFunction(this, "ChatHistoryHandler", {
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(8),
      memorySize: 256,
      entry: path.join(__dirname, "../../services/chat-history/handler.ts"),
      handler: "handler",
      bundling: {
        sourceMap: true,
        minify: true,
        target: "node20",
      },
      environment: {
        ALLOW_ORIGIN: process.env.ALLOW_ORIGIN ?? "",
        CHAT_TABLE_NAME: chatTable.tableName,
      },
    });
    chatTable.grantReadData(chatHistoryHandler);

    // ── Lambda: GET /place-photo ─────────────────────────────────────

    const placePhotoHandler = new NodejsFunction(this, "PlacePhotoHandler", {
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(10),
      memorySize: 256,
      entry: path.join(__dirname, "../../services/place-photo/handler.ts"),
      handler: "handler",
      bundling: {
        sourceMap: true,
        minify: true,
        target: "node20",
      },
      environment: {
        ALLOW_ORIGIN: process.env.ALLOW_ORIGIN ?? "",
        GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY ?? "",
      },
    });

    // ── Lambda Function URL: AI Chat (streaming) ─────────────────────

    const aiChatUrl = aiChatHandler.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
      invokeMode: InvokeMode.RESPONSE_STREAM,
      cors: {
        allowedOrigins: allowedOrigins,
        allowedMethods: [HttpMethod.POST],
        allowedHeaders: ["content-type"],
      },
    });

    // ── API Gateway ──────────────────────────────────────────────────

    const api = new RestApi(this, "AfterDarkApi", {
      restApiName: "afterdark-service",
      deployOptions: {
        stageName: "prod",
        loggingLevel: MethodLoggingLevel.INFO,
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: corsOptions,
      binaryMediaTypes: ["image/*"],
    });

    // GET /places
    const placesResource = api.root.addResource("places");
    placesResource.addMethod("GET", new LambdaIntegration(placesHandler));

    // POST /ai-chat → uses Lambda Function URL (streaming), not API Gateway

    // GET /place-photo
    const placePhotoResource = api.root.addResource("place-photo");
    placePhotoResource.addMethod(
      "GET",
      new LambdaIntegration(placePhotoHandler),
    );

    // GET /chat-history
    const chatHistoryResource = api.root.addResource("chat-history");
    chatHistoryResource.addMethod(
      "GET",
      new LambdaIntegration(chatHistoryHandler),
    );

    // ── Outputs ──────────────────────────────────────────────────────

    new CfnOutput(this, "ApiBaseUrl", {
      value: api.url,
      description: "API Gateway base URL",
    });

    new CfnOutput(this, "PlacesApiEndpoint", {
      value: api.url + "places",
    });

    new CfnOutput(this, "AiChatStreamUrl", {
      value: aiChatUrl.url,
      description: "AI Chat Lambda Function URL (streaming)",
    });

    new CfnOutput(this, "PlacePhotoEndpoint", {
      value: api.url + "place-photo",
    });

    new CfnOutput(this, "ChatHistoryEndpoint", {
      value: api.url + "chat-history",
    });

    new CfnOutput(this, "ChatTableName", {
      value: chatTable.tableName,
    });
  }
}
