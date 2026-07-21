import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { randomUUID } from "crypto";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { ValidationException } from "./core/exceptions/validation.exception";
import { GlobalExceptionFilter } from "./core/filters/global.filter";
import { TransformInterceptor } from "./core/interceptors/transform.interceptor";
import { MetricsService } from "./api/monitoring/metrics.service";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  const logger = new Logger("Bootstrap");
  const metrics = app.get(MetricsService);
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.setGlobalPrefix("api");
  app.use(helmet());
  app.use((request: any, response: any, next: () => void) => {
    const requestId = request.headers["x-request-id"] || randomUUID(); const started = Date.now(); request.headers["x-request-id"] = requestId; response.setHeader("x-request-id", requestId);
    response.on("finish", () => { const durationMs = Date.now() - started; const route = String(request.route?.path || request.path || "unknown").replace(/[a-f0-9]{24}/gi, ":id"); metrics.increment("http_requests_total", { method: request.method, status: response.statusCode }); metrics.observe("http_request_duration_ms", durationMs, { method: request.method, route }); logger.log(JSON.stringify({ event: "http_request", requestId, organizationId: request.headers["x-kivora-organization-id"] || undefined, method: request.method, route, status: response.statusCode, durationMs })); }); next();
  });
  app.enableCors({ origin: config.get<string>("FRONTEND_URL", "http://localhost:3000").split(",").map((origin) => origin.trim()), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true, exceptionFactory: (errors) => new ValidationException(errors) }));
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.enableShutdownHooks();
  const document = new DocumentBuilder().setTitle("Kivora Revenue Intelligence API").setDescription("Approval-gated live Wheelhouse revenue operations").setVersion("1.0").addBearerAuth().addApiKey({ type: "apiKey", name: "x-kivora-approval-token", in: "header" }, "approval-token").build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, document));
  const port = config.get<number>("PORT", 4000);
  await app.listen(port, config.get<string>("HOST", "0.0.0.0"));
  logger.log(`Kivora API listening on ${port}`);
}
void bootstrap();
