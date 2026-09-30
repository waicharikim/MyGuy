import "dotenv/config";
import "reflect-metadata";
import "../agent/followup.worker";
import "./inbound.worker";
console.log("Shauri workers started: inbound + followups");
