import "dotenv/config";
import { spawn, ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import {
  findNgrokWebhookUrl,
} from "./telegram-webhook";

const POLL_INTERVAL_MS = 750;
const STARTUP_TIMEOUT_MS = 90_000;

type ManagedProcess = {
  label: string;
  child: ChildProcess;
  failure?: Error;
};

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set in .env before starting Telegram development`);
  }
  return value;
}

function assertTelegramDevelopmentConfig() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The Telegram development launcher cannot run in production");
  }
  requiredEnvironment("TELEGRAM_BOT_TOKEN");
  if (requiredEnvironment("TELEGRAM_WEBHOOK_SECRET").length < 32) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET must be at least 32 characters");
  }
}

function startProcess(
  label: string,
  command: string,
  args: string[],
  env = process.env,
): ManagedProcess {
  const child = spawn(command, args, {
    cwd: resolve(__dirname, ".."),
    env,
    stdio: "inherit",
    detached: process.platform !== "win32",
  });
  const managed: ManagedProcess = { label, child };
  child.on("error", (error) => {
    managed.failure = error;
  });
  return managed;
}

function assertRunning(managed: ManagedProcess) {
  if (managed.failure) {
    throw new Error(
      `Could not start ${managed.label}: ${managed.failure.message}`,
    );
  }
  if (managed.child.exitCode !== null || managed.child.signalCode !== null) {
    throw new Error(`${managed.label} exited before setup completed`);
  }
}

async function waitUntil(
  description: string,
  check: () => Promise<boolean>,
  children: ManagedProcess[],
) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    for (const child of children) {
      assertRunning(child);
    }
    if (await check()) {
      return;
    }
    await new Promise((resolveDelay) =>
      setTimeout(resolveDelay, POLL_INTERVAL_MS),
    );
  }
  throw new Error(`${description} was not ready within 90 seconds`);
}

async function stopProcess(managed: ManagedProcess) {
  const { child } = managed;
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) {
    return;
  }

  const closed = new Promise<void>((resolveClose) => {
    child.once("close", () => resolveClose());
  });
  try {
    if (process.platform === "win32") {
      child.kill("SIGTERM");
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      error.code !== "ESRCH"
    ) {
      throw error;
    }
    return;
  }

  let timeout: NodeJS.Timeout | undefined;
  const stopped = await Promise.race([
    closed.then(() => true),
    new Promise<boolean>((resolveTimeout) => {
      timeout = setTimeout(() => resolveTimeout(false), 5_000);
    }),
  ]);
  if (timeout) {
    clearTimeout(timeout);
  }
  if (!stopped) {
    if (process.platform === "win32") {
      child.kill("SIGKILL");
    } else {
      process.kill(-child.pid, "SIGKILL");
    }
    await closed;
  }
}

async function waitForShutdown(
  api: ManagedProcess | undefined,
  tunnel: ManagedProcess,
) {
  if (api) {
    assertRunning(api);
  }
  assertRunning(tunnel);
  return new Promise<void>((resolveShutdown, rejectShutdown) => {
    const cleanupListeners = () => {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
      api?.child.off("exit", onApiExit);
      tunnel.child.off("exit", onTunnelExit);
    };
    const onSignal = () => {
      cleanupListeners();
      resolveShutdown();
    };
    const onApiExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanupListeners();
      rejectShutdown(
        new Error(`API process stopped unexpectedly (${signal ?? code})`),
      );
    };
    const onTunnelExit = (
      code: number | null,
      signal: NodeJS.Signals | null,
    ) => {
      cleanupListeners();
      rejectShutdown(
        new Error(`ngrok process stopped unexpectedly (${signal ?? code})`),
      );
    };

    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
    api?.child.once("exit", onApiExit);
    tunnel.child.once("exit", onTunnelExit);
  });
}

async function run() {
  assertTelegramDevelopmentConfig();
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid TCP port");
  }

  let api: ManagedProcess | undefined;
  let tunnel: ManagedProcess | undefined;
  try {
    let existingApiAvailable = false;
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/health/live`,
      );
      existingApiAvailable = response.ok;
    } catch {
      existingApiAvailable = false;
    }

    if (existingApiAvailable) {
      const webhookProbe = await fetch(
        `http://127.0.0.1:${port}/webhook/telegram`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      );
      if (webhookProbe.status !== 401) {
        throw new Error(
          `An API is already using port ${port}, but it does not appear to have the Telegram webhook configured. Stop it, then retry.`,
        );
      }
      console.log(`Reusing the Shauri API already running on port ${port}.`);
    } else {
      api = startProcess(
        "Shauri API",
        process.execPath,
        [
          resolve(__dirname, "../node_modules/@nestjs/cli/bin/nest.js"),
          "start",
          "--watch",
        ],
        { ...process.env, NODE_ENV: "development" },
      );
      console.log(`Starting Shauri API on port ${port}...`);
      await waitUntil(
        "Shauri API",
        async () => {
          try {
            const response = await fetch(
              `http://127.0.0.1:${port}/health/live`,
            );
            return response.ok;
          } catch {
            return false;
          }
        },
        [api],
      );
      const webhookProbe = await fetch(
        `http://127.0.0.1:${port}/webhook/telegram`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      );
      if (webhookProbe.status !== 401) {
        throw new Error("The started API does not have the Telegram webhook configured.");
      }
      console.log("Shauri API is ready.");
    }

    tunnel = startProcess("ngrok", "ngrok", ["http", String(port)]);
    console.log("Starting ngrok HTTPS tunnel...");
    let webhookUrl = "";
    await waitUntil(
      "ngrok HTTPS tunnel",
      async () => {
        try {
          const response = await fetch("http://127.0.0.1:4040/api/tunnels");
          if (!response.ok) {
            return false;
          }
          const data = (await response.json()) as {
            tunnels?: Parameters<typeof findNgrokWebhookUrl>[0];
          };
          webhookUrl = findNgrokWebhookUrl(data.tunnels ?? [], port);
          return true;
        } catch {
          return false;
        }
      },
      api ? [api, tunnel] : [tunnel],
    );

    const { registerTelegramWebhook } = await import("./telegram-webhook");
    await registerTelegramWebhook(webhookUrl);
    console.log("Telegram is ready. Keep this command running while testing.");
    console.log("Press Ctrl+C to stop the API and ngrok tunnel.");
    await waitForShutdown(api, tunnel);
  } finally {
    if (tunnel) {
      await stopProcess(tunnel);
    }
    if (api) {
      await stopProcess(api);
    }
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Telegram development startup failed",
    );
    process.exitCode = 1;
  });
}
