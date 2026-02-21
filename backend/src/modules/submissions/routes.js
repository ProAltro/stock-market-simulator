import { runAlgorithm } from "../../services/executor/executor.js";

export async function register(fastify, opts) {
  fastify.post(
    "/",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["code", "language"],
          properties: {
            code: { type: "string" },
            language: { type: "string", enum: ["python", "cpp"] },
          },
        },
      },
    },
    async (request, reply) => {
      const { code, language } = request.body;

      const submission = await fastify.prisma.algorithmSubmission.create({
        data: {
          userId: request.user.userId,
          code,
          language,
          status: "pending",
        },
      });

      runAlgorithm(submission.id, code, language, fastify.prisma).catch(
        (err) => {
          fastify.log.error({ err, submissionId: submission.id }, "Algorithm execution failed");
        }
      );

      return {
        id: submission.id,
        status: "pending",
        message: "Algorithm submitted. Poll for results.",
      };
    }
  );

  fastify.get(
    "/",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { limit = 20, offset = 0 } = request.query;

      const submissions = await fastify.prisma.algorithmSubmission.findMany({
        where: { userId: request.user.userId },
        orderBy: { createdAt: "desc" },
        take: Number(limit),
        skip: Number(offset),
        select: {
          id: true,
          language: true,
          status: true,
          finalNetWorth: true,
          totalTrades: true,
          executionTimeMs: true,
          error: true,
          createdAt: true,
          completedAt: true,
        },
      });

      return submissions;
    }
  );

  fastify.get(
    "/:id",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { id } = request.params;

      const submission = await fastify.prisma.algorithmSubmission.findFirst({
        where: {
          id,
          userId: request.user.userId,
        },
      });

      if (!submission) {
        return reply.code(404).send({ error: "Submission not found" });
      }

      return submission;
    }
  );

  fastify.get("/leaderboard", async (request, reply) => {
    const { limit = 100 } = request.query;

    const leaderboard = await fastify.prisma.algorithmSubmission.findMany({
      where: {
        status: "completed",
        finalNetWorth: { not: null },
      },
      orderBy: { finalNetWorth: "desc" },
      take: Number(limit),
      select: {
        id: true,
        finalNetWorth: true,
        totalTrades: true,
        executionTimeMs: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    return leaderboard.map((entry, index) => ({
      rank: index + 1,
      ...entry,
    }));
  });

  fastify.get(
    "/me/best",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const best = await fastify.prisma.algorithmSubmission.findFirst({
        where: {
          userId: request.user.userId,
          status: "completed",
          finalNetWorth: { not: null },
        },
        orderBy: { finalNetWorth: "desc" },
      });

      const rank = best
        ? await fastify.prisma.algorithmSubmission.count({
            where: {
              status: "completed",
              finalNetWorth: { gte: best.finalNetWorth },
            },
          })
        : null;

      return {
        bestSubmission: best,
        rank,
      };
    }
  );
}

export default register;
