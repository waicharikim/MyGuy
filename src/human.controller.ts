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
import {
  addEscalationNote,
  resolveEscalation,
  sendEscalationUpdate,
} from "./agent/operator-escalation";
import { prisma } from "./infrastructure/prisma";
import { operatorDashboardHtml } from "./operator-dashboard";

const MAX_OPERATOR_TEXT_LENGTH = 4000;

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
    @Body() body: {
      answer?: unknown;
      userMessage?: unknown;
    },
    @Headers() headers: Record<string, string | undefined>
  ) {
    this.auth(headers);
    if (typeof body?.answer !== "string" || !body.answer.trim()) {
      throw new BadRequestException("answer must be a non-empty resolution note");
    }
    if (body.answer.trim().length > MAX_OPERATOR_TEXT_LENGTH) {
      throw new BadRequestException("answer must be 4000 characters or fewer");
    }
    if (
      body.userMessage !== undefined &&
      (typeof body.userMessage !== "string" ||
        !body.userMessage.trim())
    ) {
      throw new BadRequestException("userMessage must be a non-empty string when provided");
    }
    if (
      typeof body.userMessage === "string" &&
      body.userMessage.trim().length > MAX_OPERATOR_TEXT_LENGTH
    ) {
      throw new BadRequestException("userMessage must be 4000 characters or fewer");
    }
    return resolveEscalation(
      id,
      body.answer,
      typeof body.userMessage === "string"
        ? body.userMessage
        : undefined,
    );
  }

  @Post("escalations/:id/notes")
  @Header("Cache-Control", "no-store")
  async addEscalationOperatorNote(
    @Param("id") id: string,
    @Body() body: { note?: unknown },
    @Headers() headers: Record<string, string | undefined>,
  ) {
    this.auth(headers);
    if (typeof body?.note !== "string" || !body.note.trim()) {
      throw new BadRequestException("note must be a non-empty string");
    }
    if (body.note.trim().length > MAX_OPERATOR_TEXT_LENGTH) {
      throw new BadRequestException("note must be 4000 characters or fewer");
    }
    return addEscalationNote(id, body.note);
  }

  @Post("escalations/:id/message")
  @Header("Cache-Control", "no-store")
  async sendEscalationUserMessage(
    @Param("id") id: string,
    @Body() body: { message?: unknown },
    @Headers() headers: Record<string, string | undefined>,
  ) {
    this.auth(headers);
    if (typeof body?.message !== "string" || !body.message.trim()) {
      throw new BadRequestException("message must be a non-empty string");
    }
    if (body.message.trim().length > MAX_OPERATOR_TEXT_LENGTH) {
      throw new BadRequestException("message must be 4000 characters or fewer");
    }
    return sendEscalationUpdate(id, body.message);
  }
}