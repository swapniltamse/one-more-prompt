import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CfnOutput, Duration, Names, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { HttpApi, HttpMethod, HttpStage, CorsHttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import type { Construct } from "constructs";

const here = dirname(fileURLToPath(import.meta.url));
const BACKEND = join(here, "../../backend");
const FRONTEND_DIST = join(here, "../../frontend/dist");

export interface FoblessStackProps extends StackProps {
  /** Cognito `sub` of the vehicle owner. Empty means nobody can control the car yet (secure default). */
  ownerUserId: string;
  cognitoDomainPrefix?: string;
  vehicleProvider: "simulator" | "toyota";
  alertEmail?: string;
}

export class FoblessStack extends Stack {
  constructor(scope: Construct, id: string, props: FoblessStackProps) {
    super(scope, id, props);

    // ---------- Audit log / idempotency store ----------
    const table = new dynamodb.Table(this, "Commands", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    table.addGlobalSecondaryIndex({
      indexName: "byVin",
      partitionKey: { name: "gsi1pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "gsi1sk", type: dynamodb.AttributeType.STRING },
    });
    table.addGlobalSecondaryIndex({
      indexName: "byUser",
      partitionKey: { name: "gsi2pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "gsi2sk", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });

    // ---------- Static site: private S3 behind CloudFront (OAC) ----------
    const siteBucket = new s3.Bucket(this, "Site", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const domainPrefix = props.cognitoDomainPrefix ?? `fobless-${Names.uniqueId(this).toLowerCase().slice(-8)}`;
    const cognitoHost = `${domainPrefix}.auth.${this.region}.amazoncognito.com`;

    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, "SecurityHeaders", {
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          override: true,
          contentSecurityPolicy: [
            "default-src 'self'",
            `connect-src 'self' https://*.execute-api.${this.region}.amazonaws.com https://${cognitoHost}`,
            "img-src 'self' data:",
            "script-src 'self'",
            "style-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
          ].join("; "),
        },
        strictTransportSecurity: { override: true, accessControlMaxAge: Duration.days(365), includeSubdomains: true, preload: true },
        contentTypeOptions: { override: true },
        frameOptions: { override: true, frameOption: cloudfront.HeadersFrameOption.DENY },
        referrerPolicy: { override: true, referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER },
      },
    });

    const distribution = new cloudfront.Distribution(this, "Cdn", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: securityHeaders,
      },
      additionalBehaviors: {
        "/config.json": {
          origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          responseHeadersPolicy: securityHeaders,
        },
      },
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: "/index.html",
        ttl: Duration.seconds(0),
      })),
    });
    const appUrl = `https://${distribution.distributionDomainName}`;

    // ---------- Identity: Cognito, invite-only, MFA required ----------
    const userPool = new cognito.UserPool(this, "Users", {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: { otp: true, sms: false },
      passwordPolicy: { minLength: 12, requireSymbols: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    userPool.addDomain("Domain", { cognitoDomain: { domainPrefix } });
    const client = userPool.addClient("Web", {
      generateSecret: false,
      preventUserExistenceErrors: true,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
        callbackUrls: [`${appUrl}/`, "http://localhost:5173/"],
        logoutUrls: [`${appUrl}/`, "http://localhost:5173/"],
      },
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.hours(1),
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
    });

    // ---------- API: Lambda behind HTTP API with a JWT authorizer ----------
    const logGroup = new logs.LogGroup(this, "ApiLogs", { retention: logs.RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY });
    const fn = new NodejsFunction(this, "Api", {
      entry: join(BACKEND, "src/lambda.ts"),
      projectRoot: BACKEND,
      depsLockFilePath: join(BACKEND, "package-lock.json"),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(29),
      tracing: lambda.Tracing.ACTIVE,
      logGroup,
      bundling: {
        format: OutputFormat.ESM,
        minify: true,
        sourceMap: true,
        // AWS SDK v3 is provided by the Lambda runtime.
        externalModules: ["@aws-sdk/*"],
        banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
      environment: {
        NODE_ENV: "production",
        NODE_OPTIONS: "--enable-source-maps",
        AUTH_MODE: "cognito",
        COGNITO_REGION: this.region,
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_CLIENT_ID: client.userPoolClientId,
        ALLOWED_USER_IDS: props.ownerUserId || "nobody-yet",
        VEHICLE_PROVIDER: props.vehicleProvider,
        SIMULATOR_LATENCY_MS: "2500",
        VEHICLE_TIMEOUT_MS: "25000",
        COMMANDS_TABLE: table.tableName,
        CORS_ORIGIN: appUrl,
      },
    });
    table.grantReadWriteData(fn);

    const api = new HttpApi(this, "HttpApi", {
      createDefaultStage: false,
      corsPreflight: {
        allowOrigins: [appUrl, "http://localhost:5173"],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST],
        allowHeaders: ["authorization", "content-type", "idempotency-key"],
        exposeHeaders: ["idempotent-replayed", "x-request-id"],
        maxAge: Duration.hours(1),
      },
    });
    const stage = new HttpStage(this, "Stage", {
      httpApi: api,
      stageName: "$default",
      autoDeploy: true,
      throttle: { rateLimit: 5, burstLimit: 10 },
    });
    const integration = new HttpLambdaIntegration("Lambda", fn);
    const authorizer = new HttpJwtAuthorizer("Cognito", `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`, {
      jwtAudience: [client.userPoolClientId],
    });
    api.addRoutes({ path: "/api/health", methods: [HttpMethod.GET], integration });
    api.addRoutes({ path: "/api/{proxy+}", methods: [HttpMethod.GET, HttpMethod.POST], integration, authorizer });

    // ---------- Frontend deploy with runtime config ----------
    if (!existsSync(FRONTEND_DIST)) {
      throw new Error("frontend/dist not found. Run `npm run build` in frontend/ before synth/deploy.");
    }
    new s3deploy.BucketDeployment(this, "DeploySite", {
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ["/*"],
      sources: [
        s3deploy.Source.asset(FRONTEND_DIST, { exclude: ["config.json"] }),
        s3deploy.Source.jsonData("config.json", {
          apiBaseUrl: stage.url.replace(/\/$/, ""),
          authMode: "cognito",
          cognito: { domain: cognitoHost, clientId: client.userPoolClientId, redirectUri: `${appUrl}/` },
        }),
      ],
    });

    // ---------- Observability ----------
    const alarmTopic = new sns.Topic(this, "Alarms");
    if (props.alertEmail) alarmTopic.addSubscription(new subs.EmailSubscription(props.alertEmail));
    const notify = new cwActions.SnsAction(alarmTopic);

    new cloudwatch.Alarm(this, "ApiErrors", {
      metric: fn.metricErrors({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "Lambda threw an unhandled error",
    }).addAlarmAction(notify);

    // Security signal: repeated step-up failures or rate limiting suggest a stolen token.
    const suspicious = new logs.MetricFilter(this, "SuspiciousCommands", {
      logGroup,
      metricNamespace: "Fobless",
      metricName: "SuspiciousCommandAttempts",
      filterPattern: logs.FilterPattern.any(
        logs.FilterPattern.stringValue("$.event", "=", "command.step_up_required"),
        logs.FilterPattern.stringValue("$.event", "=", "command.rate_limited"),
      ),
      metricValue: "1",
    });
    new cloudwatch.Alarm(this, "SuspiciousCommandAlarm", {
      metric: suspicious.metric({ period: Duration.minutes(5), statistic: "Sum" }),
      threshold: 3,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "Multiple blocked vehicle commands in 5 minutes",
    }).addAlarmAction(notify);

    const failed = new logs.MetricFilter(this, "FailedCommands", {
      logGroup,
      metricNamespace: "Fobless",
      metricName: "FailedCommands",
      filterPattern: logs.FilterPattern.stringValue("$.event", "=", "command.failed"),
      metricValue: "1",
    });
    new cloudwatch.Alarm(this, "FailedCommandAlarm", {
      metric: failed.metric({ period: Duration.minutes(15), statistic: "Sum" }),
      threshold: 3,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "Vehicle commands are failing (vendor outage or car out of coverage)",
    }).addAlarmAction(notify);

    // ---------- Outputs ----------
    new CfnOutput(this, "AppUrl", { value: appUrl });
    new CfnOutput(this, "ApiUrl", { value: stage.url });
    new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "CreateOwnerHint", {
      value: `aws cognito-idp admin-create-user --user-pool-id ${userPool.userPoolId} --username you@example.com --user-attributes Name=email,Value=you@example.com Name=email_verified,Value=true`,
    });
  }
}
