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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HumanController = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const client_1 = require("@prisma/client");
const human_query_1 = require("./agent/human-query");
const operator_queue_1 = require("./agent/operator-queue");
const decision_outcome_1 = require("./agent/decision-outcome");
const operator_escalation_1 = require("./agent/operator-escalation");
const operator_dashboard_1 = require("./operator-dashboard");
const MAX_OPERATOR_TEXT_LENGTH = 4000;
let HumanController = class HumanController {
    auth(headers) {
        const expected = process.env.INTERNAL_OPERATOR_TOKEN;
        const supplied = headers["x-operator-token"];
        if (!expected ||
            !supplied ||
            Buffer.byteLength(expected) !== Buffer.byteLength(supplied) ||
            !(0, node_crypto_1.timingSafeEqual)(Buffer.from(expected), Buffer.from(supplied))) {
            throw new common_1.UnauthorizedException();
        }
    }
    dashboard() {
        return operator_dashboard_1.operatorDashboardHtml;
    }
    async queue(headers) {
        this.auth(headers);
        return (0, operator_queue_1.getOperatorQueue)();
    }
    async outcomes(headers) {
        this.auth(headers);
        return (0, decision_outcome_1.listUnclassifiedDecisionOutcomes)();
    }
    async metrics(headers) {
        this.auth(headers);
        return (0, decision_outcome_1.getDecisionQualityMetrics)();
    }
    async classifyOutcome(threadId, body, headers) {
        this.auth(headers);
        const status = Object.values(client_1.DecisionOutcomeStatus).find((candidate) => candidate === body?.status);
        if (!status) {
            throw new common_1.BadRequestException(`status must be one of: ${Object.values(client_1.DecisionOutcomeStatus).join(", ")}`);
        }
        if (body?.notes !== undefined &&
            typeof body.notes !== "string") {
            throw new common_1.BadRequestException("notes must be a string");
        }
        const notes = typeof body?.notes === "string"
            ? body.notes
            : undefined;
        return (0, decision_outcome_1.classifyDecisionOutcome)({
            threadId,
            status,
            notes,
        });
    }
    async answer(id, body, headers) {
        this.auth(headers);
        return (0, human_query_1.resumeHumanQueryFromOperator)(id, String(body.answer || ""));
    }
    async resolve(id, body, headers) {
        this.auth(headers);
        if (typeof body?.answer !== "string" || !body.answer.trim()) {
            throw new common_1.BadRequestException("answer must be a non-empty resolution note");
        }
        if (body.answer.trim().length > MAX_OPERATOR_TEXT_LENGTH) {
            throw new common_1.BadRequestException("answer must be 4000 characters or fewer");
        }
        if (body.userMessage !== undefined &&
            (typeof body.userMessage !== "string" ||
                !body.userMessage.trim())) {
            throw new common_1.BadRequestException("userMessage must be a non-empty string when provided");
        }
        if (typeof body.userMessage === "string" &&
            body.userMessage.trim().length > MAX_OPERATOR_TEXT_LENGTH) {
            throw new common_1.BadRequestException("userMessage must be 4000 characters or fewer");
        }
        return (0, operator_escalation_1.resolveEscalation)(id, body.answer, typeof body.userMessage === "string"
            ? body.userMessage
            : undefined);
    }
    async addEscalationOperatorNote(id, body, headers) {
        this.auth(headers);
        if (typeof body?.note !== "string" || !body.note.trim()) {
            throw new common_1.BadRequestException("note must be a non-empty string");
        }
        if (body.note.trim().length > MAX_OPERATOR_TEXT_LENGTH) {
            throw new common_1.BadRequestException("note must be 4000 characters or fewer");
        }
        return (0, operator_escalation_1.addEscalationNote)(id, body.note);
    }
    async sendEscalationUserMessage(id, body, headers) {
        this.auth(headers);
        if (typeof body?.message !== "string" || !body.message.trim()) {
            throw new common_1.BadRequestException("message must be a non-empty string");
        }
        if (body.message.trim().length > MAX_OPERATOR_TEXT_LENGTH) {
            throw new common_1.BadRequestException("message must be 4000 characters or fewer");
        }
        return (0, operator_escalation_1.sendEscalationUpdate)(id, body.message);
    }
};
exports.HumanController = HumanController;
__decorate([
    (0, common_1.Get)("dashboard"),
    (0, common_1.Header)("Content-Type", "text/html; charset=utf-8"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HumanController.prototype, "dashboard", null);
__decorate([
    (0, common_1.Get)("queue"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    __param(0, (0, common_1.Headers)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], HumanController.prototype, "queue", null);
__decorate([
    (0, common_1.Get)("outcomes"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    __param(0, (0, common_1.Headers)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], HumanController.prototype, "outcomes", null);
__decorate([
    (0, common_1.Get)("metrics"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    __param(0, (0, common_1.Headers)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], HumanController.prototype, "metrics", null);
__decorate([
    (0, common_1.Post)("decisions/:threadId/outcome"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    __param(0, (0, common_1.Param)("threadId")),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], HumanController.prototype, "classifyOutcome", null);
__decorate([
    (0, common_1.Post)("queries/:id/answer"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], HumanController.prototype, "answer", null);
__decorate([
    (0, common_1.Post)("escalations/:id/resolve"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], HumanController.prototype, "resolve", null);
__decorate([
    (0, common_1.Post)("escalations/:id/notes"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], HumanController.prototype, "addEscalationOperatorNote", null);
__decorate([
    (0, common_1.Post)("escalations/:id/message"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], HumanController.prototype, "sendEscalationUserMessage", null);
exports.HumanController = HumanController = __decorate([
    (0, common_1.Controller)("internal/human")
], HumanController);
