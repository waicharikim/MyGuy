"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
require("reflect-metadata");
require("../agent/followup.worker");
require("../agent/operator-notification.worker");
require("./inbound.worker");
console.log("Shauri workers started: inbound, followups + operator notifications");
