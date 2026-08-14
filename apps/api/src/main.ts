import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./http-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true }); const config = app.get(ConfigService);
  app.setGlobalPrefix("api/v1");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.enableCors({ origin: config.getOrThrow<string>("CORS_ORIGIN"), credentials: true, methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
  const port = config.get<number>("PORT") ?? 3001;
  await app.listen(port, "0.0.0.0");
  console.log(`API listening on ${port}`);
}
void bootstrap().catch((error: unknown) => {
  // Railway only reports a generic health-check failure when startup exits.
  // Write the original error to stderr so production deployments remain
  // diagnosable without exposing it to API clients.
  console.error("API bootstrap failed", error);
  process.exitCode = 1;
});
