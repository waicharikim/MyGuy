import "dotenv/config";
import "reflect-metadata";
import { NextFunction, Request, Response } from "express";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { validateProductionEnvironment } from "./config/environment";

async function bootstrap() {
  validateProductionEnvironment(process.env);
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    if (process.env.NODE_ENV === "production") {
      response.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    }
    next();
  });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  console.log(`Shauri API listening on ${port}`);
}
bootstrap();
