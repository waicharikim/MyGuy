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
    if (
      !process.env.INTERNAL_OPERATOR_TOKEN ||
      headers["x-operator-token"] !== process.env.INTERNAL_OPERATOR_TOKEN
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
  async queue(
    @Headers() headers: Record<string, string | undefined>,
  ) {
    this.auth(headers);
    return getOperatorQueue();
  }

  @Get("outcomes")
  async outcomes(
    @Headers() headers: Record<string, string | undefined>,
  ) {
    this.auth(headers);
    return listUnclassifiedDecisionOutcomes();
  }

  @Get("metrics")
  async metrics(
    @Headers() headers: Record<string, string | undefined>,
  ) {
    this.auth(headers);
    return getDecisionQualityMetrics();
  }

  @Post("decisions/:threadId/outcome")
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
  async answer(
    @Param("id") id: string,
    @Body() body: { answer?: string },
    @Headers() headers: Record<string, string | undefined>
  ) {
    this.auth(headers);
    return resumeHumanQueryFromOperator(id, String(body.answer || ""));
  }

  @Post("escalations/:id/resolve")
  async resolve(
    @Param("id") id: string,
    @Body() body: { answer?: string },
    @Headers() headers: Record<string, string | undefined>
  ) {
    this.auth(headers);
    return prisma.escalation.update({
      where: { id },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        messages: {
          create: {
            direction: "IN",
            content: String(body.answer || "Resolved by operator"),
          },
        },
      },
    });
  }
}