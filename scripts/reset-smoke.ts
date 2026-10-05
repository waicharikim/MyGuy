/**
 * Reset state for Shauri smoke tests.
 *
 * Deletes one test user and all data belonging to that user's
 * decision threads.
 *
 * This is intentionally scoped by phone so smoke tests do not
 * destroy unrelated development data.
 */

import "dotenv/config";

import { prisma } from "../src/infrastructure/prisma";

export async function resetSmokeUser(phone: string) {
  const user = await prisma.user.findUnique({
    where: { phone },
    select: { id: true },
  });

  if (!user) {
    console.log(`No smoke-test user found for ${phone}`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    const threads = await tx.thread.findMany({
      where: {
        userId: user.id,
      },
      select: {
        id: true,
      },
    });

    const threadIds = threads.map(
      (thread) => thread.id,
    );

    if (threadIds.length > 0) {
      /*
       * Agent interaction messages
       */
      const interactions =
        await tx.agentInteraction.findMany({
          where: {
            threadId: {
              in: threadIds,
            },
          },
          select: {
            id: true,
          },
        });

      const interactionIds =
        interactions.map(
          (interaction) => interaction.id,
        );

      if (interactionIds.length > 0) {
        await tx.agentInteractionMessage.deleteMany({
          where: {
            interactionId: {
              in: interactionIds,
            },
          },
        });

        await tx.agentInteraction.deleteMany({
          where: {
            id: {
              in: interactionIds,
            },
          },
        });
      }

      /*
       * Human queries
       */
      const humanQueries =
        await tx.humanQuery.findMany({
          where: {
            threadId: {
              in: threadIds,
            },
          },
          select: {
            id: true,
          },
        });

      const humanQueryIds =
        humanQueries.map(
          (query) => query.id,
        );

      if (humanQueryIds.length > 0) {
        await tx.humanQueryMessage.deleteMany({
          where: {
            humanQueryId: {
              in: humanQueryIds,
            },
          },
        });

        await tx.humanQuery.deleteMany({
          where: {
            id: {
              in: humanQueryIds,
            },
          },
        });
      }

      /*
       * Escalations
       */
      const escalations =
        await tx.escalation.findMany({
          where: {
            threadId: {
              in: threadIds,
            },
          },
          select: {
            id: true,
          },
        });

      const escalationIds =
        escalations.map(
          (escalation) => escalation.id,
        );

      if (escalationIds.length > 0) {
        await tx.escalationMessage.deleteMany({
          where: {
            escalationId: {
              in: escalationIds,
            },
          },
        });

        await tx.escalation.deleteMany({
          where: {
            id: {
              in: escalationIds,
            },
          },
        });
      }

      /*
       * Thread-owned records
       */
      await tx.graphCheckpoint.deleteMany({
        where: {
          threadId: {
            in: threadIds,
          },
        },
      });

      await tx.groundingEvidence.deleteMany({
        where: {
          threadId: {
            in: threadIds,
          },
        },
      });

      await tx.scheduledFollowup.deleteMany({
        where: {
          threadId: {
            in: threadIds,
          },
        },
      });

      await tx.task.deleteMany({
        where: {
          threadId: {
            in: threadIds,
          },
        },
      });

      await tx.note.deleteMany({
        where: {
          threadId: {
            in: threadIds,
          },
        },
      });

      await tx.knowledgeCandidate.deleteMany({
        where: {
          threadId: {
            in: threadIds,
          },
        },
      });

      await tx.payment.deleteMany({
        where: {
          threadId: {
            in: threadIds,
          },
        },
      });

      await tx.message.deleteMany({
        where: {
          threadId: {
            in: threadIds,
          },
        },
      });

      /*
       * Threads
       */
      await tx.thread.deleteMany({
        where: {
          id: {
            in: threadIds,
          },
        },
      });
    }

    /*
     * User-level records
     */
    await tx.payment.deleteMany({
      where: {
        userId: user.id,
      },
    });

    await tx.humanQuery.deleteMany({
      where: {
        userId: user.id,
      },
    });

    await tx.escalation.deleteMany({
      where: {
        userId: user.id,
      },
    });

    await tx.knowledgeCandidate.deleteMany({
      where: {
        userId: user.id,
      },
    });

    await tx.task.deleteMany({
      where: {
        userId: user.id,
      },
    });

    await tx.note.deleteMany({
      where: {
        userId: user.id,
      },
    });

    await tx.userProfile.deleteMany({
      where: {
        userId: user.id,
      },
    });

    /*
     * Inbound receipts are independent of Thread but belong
     * to the test phone.
     */
    await tx.inboundReceipt.deleteMany({
      where: {
        phone,
      },
    });

    /*
     * Finally remove the test user.
     */
    await tx.user.delete({
      where: {
        id: user.id,
      },
    });
  });

  console.log(
    `Smoke state reset for ${phone}`,
  );
}


/*
 * Allow this file to be executed directly:
 *
 *   npm run smoke:reset
 */

async function main() {
  const phone =
    process.env.SMOKE_TEST_PHONE ||
    "254700000000";

  await resetSmokeUser(phone);

  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error(error);

    try {
      await prisma.$disconnect();
    } catch {
      /* ignore */
    }

    process.exit(1);
  });
}