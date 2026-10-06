import "dotenv/config";

import { ServiceUnavailableException } from "@nestjs/common";
import { HealthController } from "../src/health.controller";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function main() {
  const controller = new HealthController();
  try {
    assert(
      controller.live().status === "ok",
      "Liveness should succeed without querying dependencies.",
    );

    const readiness = await controller.ready();
    assert(readiness.status === "ready", "Ready state should be returned when local dependencies respond.");
    assert(
      readiness.dependencies.database === "ok" &&
        readiness.dependencies.redis === "ok",
      "Readiness should verify both PostgreSQL and Redis.",
    );
    console.log("✓ liveness and PostgreSQL/Redis readiness probes pass");
    console.log("HEALTH CHECK TEST PASSED");
  } finally {
    controller.onModuleDestroy();
  }

  const previousRedisHost = process.env.REDIS_HOST;
  const previousRedisPort = process.env.REDIS_PORT;
  process.env.REDIS_HOST = "127.0.0.1";
  process.env.REDIS_PORT = "1";
  const unavailableController = new HealthController();
  try {
    let unavailable: unknown;
    try {
      await unavailableController.ready();
    } catch (error) {
      unavailable = error;
    }
    assert(
      unavailable instanceof ServiceUnavailableException &&
        unavailable.getStatus() === 503,
      "Readiness should return 503 when Redis is unavailable.",
    );
    const response = unavailable.getResponse() as {
      dependencies?: { database?: string; redis?: string };
    };
    assert(
      response.dependencies?.database === "ok" &&
        response.dependencies.redis === "unavailable",
      "Readiness should identify the unavailable dependency without exposing error details.",
    );
    console.log("✓ readiness fails closed with HTTP 503 when Redis is unavailable");
  } finally {
    unavailableController.onModuleDestroy();
    if (previousRedisHost === undefined) {
      delete process.env.REDIS_HOST;
    } else {
      process.env.REDIS_HOST = previousRedisHost;
    }
    if (previousRedisPort === undefined) {
      delete process.env.REDIS_PORT;
    } else {
      process.env.REDIS_PORT = previousRedisPort;
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
