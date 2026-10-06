import {
  Controller,
  Get,
  Header,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";
import Redis from "ioredis";
import { prisma } from "./infrastructure/prisma";

@Controller("health")
export class HealthController implements OnModuleDestroy {
  private readonly logger = new Logger(HealthController.name);
  private readonly redis = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT || 6379),
    lazyConnect: true,
    connectTimeout: 3000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });

  constructor() {
    this.redis.on("error", (error: Error) => {
      this.logger.warn(`Redis connection error (${error.name})`);
    });
  }

  @Get("live")
  @Header("Cache-Control", "no-store")
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  @Header("Cache-Control", "no-store")
  async ready() {
    const checks = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
    ]);
    const dependencies = {
      database: checks[0].status === "fulfilled" ? "ok" : "unavailable",
      redis: checks[1].status === "fulfilled" ? "ok" : "unavailable",
    };

    checks.forEach((check, index) => {
      if (check.status === "rejected" && index === 0) {
        const errorType =
          check.reason instanceof Error
            ? check.reason.name
            : typeof check.reason;
        this.logger.error(`database readiness check failed (${errorType})`);
      }
    });

    if (checks.some((check) => check.status === "rejected")) {
      throw new ServiceUnavailableException({
        status: "not_ready",
        dependencies,
      });
    }

    return { status: "ready", dependencies };
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }
}
