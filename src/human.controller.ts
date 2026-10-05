import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Headers,
  Header,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { DecisionOutcomeStatus } from "@prisma/client";
import { resumeHumanQueryFromOperator } from "./agent/human-query";
import { getOperatorQueue } from "./agent/operator-queue";
import {
  classifyDecisionOutcome,
  getDecisionQualityMetrics,
  listUnclassifiedDecisionOutcomes,
} from "./agent/decision-outcome";
import { prisma } from "./infrastructure/prisma";
import { operatorDashboardHtml } from "./operator-dashboard";

@Controller("internal/human")
export class HumanController {
  private auth(headers: Record<string, string | undefined>) {
    const expected = process.env.INTERNAL_OPERATOR_TOKEN;
    const supplied = headers["x-operator-token"];
    if (
      !expected ||
      !supplied ||
      Buffer.byteLength(expected) !== Buffer.byteLength(supplied) ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
    ) {
      throw new UnauthorizedException();
    }
  }

  @Get("dashboard")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "no-store")
  dashboard() {
    return operatorDashboardHtml;
  }

  @Get("queue")
  @Header("Cache-Control", "no-store")
  async queue(
    @Headers() headers: Record<string, string | undefined>,
  ) {
    this.auth(headers);
    return getOperatorQueue();
  }

  @Get("outcomes")
  @Header("Cache-Control", "no-store")
  async outcomes(
    @Headers() headers: Record<string, string | undefined>,
  ) {
    this.auth(headers);
    return listUnclassifiedDecisionOutcomes();
  }

  @Get("metrics")
  @Header("Cache-Control", "no-store")
  async metrics(
    @Headers() headers: Record<string, string | undefined>,
  ) {
    this.auth(headers);
    return getDecisionQualityMetrics();
  }

  @Post("decisions/:threadId/outcome")
  @Header("Cache-Control", "no-store")
  async classifyOutcome(
    @Param("threadId") threadId: string,
    @Body() body: { status?: unknown; notes?: unknown },
    @Headers() headers: Record<string, string | undefined>,
  ) {
    this.auth(headers);

    const status = Object.values(DecisionOutcomeStatus).find(
      (candidate) => candidate === body?.status,
    );

    if (!status) {
      throw new BadRequestException(
        `status must be one of: ${Object.values(DecisionOutcomeStatus).join(", ")}`,
      );
    }

    if (
      body?.notes !== undefined &&
      typeof body.notes !== "string"
    ) {
      throw new BadRequestException("notes must be a string");
    }

    const notes =
      typeof body?.notes === "string"
        ? body.notes
        : undefined;

    return classifyDecisionOutcome({
      threadId,
      status,
      notes,
    });
  }

  @Post("queries/:id/answer")
  @Header("Cache-Control", "no-store")
  async answer(
    @Param("id") id: string,
    @Body() body: { answer?: string },
    @Headers() headers: Record<string, string | undefined>
  ) {
    this.auth(headers);
    return resumeHumanQueryFromOperator(id, String(body.answer || ""));
  }

  @Post("escalations/:id/resolve")
  @Header("Cache-Control", "no-store")
  async resolve(
    @Param("id") id: string,
    @Body() body: { answer?: string },
    @Headers() headers: Record<string, string | undefined>
  ) {
    this.auth(headers);
    const answer = String(body.answer || "Resolved by operator").trim();
    if (!answer) {
      throw new BadRequestException("answer must not be empty");
    }

    return prisma.$transaction(async (tx) => {
      const escalation = await tx.escalation.findUniqueOrThrow({
        where: { id },
      });
      if (escalation.status !== "OPEN") {
        throw new BadRequestException("Escalation is no longer open");
      }

      const resolved = await tx.escalation.update({
        where: { id },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
          messages: {
            create: {
              direction: "IN",
              content: answer,
            },
          },
        },
      });
      await tx.thread.updateMany({
        where: { id: escalation.threadId, status: "ESCALATED" },
        data: {
          status: "OPEN",
          closedAt: null,
          awaitingReply: false,
          awaitingHuman: false,
          awaitingSource: "NONE",
        },
      });
      await tx.decisionRecord.updateMany({
        where: {
          threadId: escalation.threadId,
          status: "ESCALATED",
        },
        data: {
          status: "OPEN",
          closedAt: null,
        },
      });
      return resolved;
    });
  }
}