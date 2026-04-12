import path from "node:path";

import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import {
  Cors,
  LambdaIntegration,
  MethodLoggingLevel,
  RestApi,
} from "aws-cdk-lib/aws-apigateway";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

export class AfterDarkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

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
        ALLOW_ORIGIN: process.env.ALLOW_ORIGIN ?? "*",
        MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN ?? "",
      },
    });

    const api = new RestApi(this, "AfterDarkApi", {
      restApiName: "afterdark-service",
      deployOptions: {
        stageName: "prod",
        loggingLevel: MethodLoggingLevel.INFO,
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: ["GET", "OPTIONS"],
        allowHeaders: ["content-type", "authorization"],
      },
    });

    const placesResource = api.root.addResource("places");
    placesResource.addMethod("GET", new LambdaIntegration(placesHandler));

    new CfnOutput(this, "PlacesApiEndpoint", {
      value: api.url + "places",
    });
  }
}
