export async function register(fastify, opts) {
  // Get user profile with settings
  fastify.get(
    "/",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.userId;

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          displayName: true,
          isPublic: true,
          currency: true,
          showOnLeaderboard: true,
          activeMode: true,
          createdAt: true,
          accounts: {
            select: {
              id: true,
              name: true,
              mode: true,
              cashBalance: true,
              initialBalance: true,
              createdAt: true,
            },
          },
        },
      });

      if (!user) {
        return reply.code(404).send({ error: "User not found" });
      }

      return user;
    },
  );

  // Update profile settings
  fastify.patch(
    "/",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.userId;
      const { displayName, isPublic, currency, showOnLeaderboard } = request.body;

      const updateData = {};
      if (displayName !== undefined) updateData.displayName = displayName;
      if (isPublic !== undefined) updateData.isPublic = isPublic;
      if (currency !== undefined) updateData.currency = currency;
      if (showOnLeaderboard !== undefined) updateData.showOnLeaderboard = showOnLeaderboard;

      if (Object.keys(updateData).length === 0) {
        return reply.code(400).send({ error: "No valid fields to update" });
      }

      const user = await fastify.prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          email: true,
          displayName: true,
          isPublic: true,
          currency: true,
          showOnLeaderboard: true,
          updatedAt: true,
        },
      });

      // Clear leaderboard cache when visibility changes
      if (showOnLeaderboard !== undefined || isPublic !== undefined) {
        try {
          await fastify.redis.del("leaderboard:top");
        } catch (err) {
          fastify.log.warn("Failed to clear leaderboard cache");
        }
      }

      return {
        message: "Profile updated successfully",
        user,
      };
    },
  );

  // Add funds to account (Standard mode only)
  fastify.post(
    "/add-funds",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { amount } = request.body;

      if (!amount || amount <= 0) {
        return reply.code(400).send({ error: "Amount must be greater than 0" });
      }

      const user = await fastify.prisma.user.findUnique({
          where: { id: request.user.userId },
          select: { activeMode: true }
      });

      const account = await fastify.prisma.account.findFirst({
        where: { userId: request.user.userId, mode: user.activeMode },
      });

      if (!account) {
        return reply.code(404).send({ error: "Active account not found" });
      }

      if (account.mode === "RANKED") {
        return reply.code(400).send({ error: "Cannot add funds to Ranked mode account" });
      }

      const updated = await fastify.prisma.account.update({
        where: { id: account.id },
        data: {
          cashBalance: { increment: amount },
        },
      });

      return {
        success: true,
        cashBalance: updated.cashBalance,
      };
    },
  );

  // Reset account
  fastify.post(
    "/reset-account",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const user = await fastify.prisma.user.findUnique({
          where: { id: request.user.userId },
          select: { activeMode: true }
      });

      const account = await fastify.prisma.account.findFirst({
        where: { userId: request.user.userId, mode: user.activeMode },
      });

      if (!account) {
        return reply.code(404).send({ error: "Active account not found" });
      }

      // Delete all trades first (due to foreign key)
      await fastify.prisma.trade.deleteMany({
        where: { order: { accountId: account.id } },
      });

      // Delete all orders
      await fastify.prisma.order.deleteMany({
        where: { accountId: account.id },
      });

      // Delete all positions
      await fastify.prisma.position.deleteMany({
        where: { accountId: account.id },
      });

      // Reset cash balance
      const resetBalance = account.mode === "RANKED" ? 100000 : Number(account.initialBalance);

      const updated = await fastify.prisma.account.update({
        where: { id: account.id },
        data: {
          cashBalance: resetBalance,
        },
      });

      return {
        success: true,
        cashBalance: updated.cashBalance,
        message: "Account reset successfully",
      };
    },
  );

  // Switch account mode (Non-destructive)
  fastify.post(
    "/switch-mode",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.userId;
      const { mode } = request.body;

      if (!["STANDARD", "RANKED"].includes(mode)) {
        return reply.code(400).send({ error: "Invalid mode. Must be STANDARD or RANKED" });
      }

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
      });

      if (user.activeMode === mode) {
        return reply.code(400).send({ error: `Already in ${mode} mode` });
      }

      // Check if account for this mode exists, if not create it
      let account = await fastify.prisma.account.findFirst({
        where: { userId, mode },
      });

      if (!account) {
        account = await fastify.prisma.account.create({
          data: {
            userId,
            mode,
            name: `${mode} Account`,
            cashBalance: 100000,
            initialBalance: 100000,
          },
        });
      }

      // Update active mode
      await fastify.prisma.user.update({
        where: { id: userId },
        data: { activeMode: mode },
      });

      return {
        success: true,
        mode: account.mode,
        cashBalance: account.cashBalance,
        message: `Switched to ${mode} mode`,
      };
    },
  );

  // Get public profile by user ID (for viewing other users)
  fastify.get("/:userId", async (request, reply) => {
    const { userId } = request.params;

    const user = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        isPublic: true,
        createdAt: true,
      },
    });

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    if (!user.isPublic) {
      return reply.code(403).send({ error: "This profile is private" });
    }

    const account = await fastify.prisma.account.findFirst({
      where: { userId },
      include: {
        positions: true,
        orders: {
          where: { status: "FILLED" },
        },
      },
    });

    return {
      displayName: user.displayName || "Anonymous Trader",
      isPublic: user.isPublic,
      joinedAt: user.createdAt,
      stats: account
        ? {
            positionsCount: account.positions.length,
            totalTrades: account.orders.length,
          }
        : null,
    };
  });
}

export default register;

