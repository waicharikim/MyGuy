"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var HealthController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
const prisma_1 = require("./infrastructure/prisma");
let HealthController = HealthController_1 = class HealthController {
    logger = new common_1.Logger(HealthController_1.name);
    redis = new ioredis_1.default({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT || 6379),
        lazyConnect: true,
        connectTimeout: 3000,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
    });
    constructor() {
        this.redis.on("error", (error) => {
            this.logger.warn(`Redis connection error (${error.name})`);
        });
    }
    live() {
        return { status: "ok" };
    }
    async ready() {
        const checks = await Promise.allSettled([
            prisma_1.prisma.$queryRaw `SELECT 1`,
            this.redis.ping(),
        ]);
        const dependencies = {
            database: checks[0].status === "fulfilled" ? "ok" : "unavailable",
            redis: checks[1].status === "fulfilled" ? "ok" : "unavailable",
        };
        checks.forEach((check, index) => {
            if (check.status === "rejected" && index === 0) {
                const errorType = check.reason instanceof Error
                    ? check.reason.name
                    : typeof check.reason;
                this.logger.error(`database readiness check failed (${errorType})`);
            }
        });
        if (checks.some((check) => check.status === "rejected")) {
            throw new common_1.ServiceUnavailableException({
                status: "not_ready",
                dependencies,
            });
        }
        return { status: "ready", dependencies };
    }
    onModuleDestroy() {
        this.redis.disconnect();
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, common_1.Get)("live"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HealthController.prototype, "live", null);
__decorate([
    (0, common_1.Get)("ready"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "ready", null);
exports.HealthController = HealthController = HealthController_1 = __decorate([
    (0, common_1.Controller)("health"),
    __metadata("design:paramtypes", [])
], HealthController);
