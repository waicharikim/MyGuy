import "dotenv/config";
import "reflect-metadata";
import { validateProductionEnvironment } from "../config/environment";

async function startWorkers() {
  validateProductionEnvironment(process.env);
  await Promise.all([
    import("../agent/followup.worker"),
    import("../agent/operator-notification.worker"),
    import("./inbound.worker"),
  ]);
  console.log("Shauri workers started: inbound, followups + operator notifications");
}

startWorkers().catch((error) => {
  console.error("Worker startup failed", error);
  process.exitCode = 1;
});
