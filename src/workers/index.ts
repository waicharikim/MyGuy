import "dotenv/config";
import "reflect-metadata";
import "../agent/followup.worker";
import "../agent/operator-notification.worker";
import "./inbound.worker";
console.log("Shauri workers started: inbound, followups + operator notifications");
