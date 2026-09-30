import {
  Controller,
  Post,
  Param,
  Body,
  Headers,
  UnauthorizedException,
} from "@nestjs/common";
import { resumeHumanQueryFromOperator } from "./agent/human-query";
import { prisma } from "./infrastructure/prisma";

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