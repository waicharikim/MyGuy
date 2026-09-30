import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  console.log(`Shauri API listening on ${port}`);
}
bootstrap();
