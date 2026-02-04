import bcrypt from "bcrypt";

export async function register(fastify, opts) {
  // Register new user
  fastify.post(
    "/register",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 6 },
            displayName: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { email, password, displayName } = request.body;

      // Check if user exists
      const existingUser = await fastify.prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return reply.code(409).send({ error: "Email already registered" });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user with default trading account
      const user = await fastify.prisma.user.create({
        data: {
          email,
          passwordHash,
          activeMode: "STANDARD",
          accounts: {
            create: {
              name: "Standard Account",
              mode: "STANDARD",
              cashBalance: process.env.DEFAULT_STARTING_BALANCE || 100000,
            },
          },
        },
        include: {
          accounts: true,
        },
      });

      // Generate token
      const token = fastify.jwt.sign({
        userId: user.id,
        email: user.email,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
        },
        account: user.accounts[0],
        token,
      };
    },
  );

  // Login
  fastify.post(
    "/login",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      const user = await fastify.prisma.user.findUnique({
        where: { email },
        include: { accounts: true },
      });

      if (!user) {
        return reply.code(401).send({ error: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(password, user.passwordHash);
      if (!validPassword) {
        return reply.code(401).send({ error: "Invalid credentials" });
      }

      const token = fastify.jwt.sign({
        userId: user.id,
        email: user.email,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
        },
        account: user.accounts[0],
        token,
      };
    },
  );

  // Get current user
  fastify.get(
    "/me",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const user = await fastify.prisma.user.findUnique({
        where: { id: request.user.userId },
        include: {
          accounts: {
            include: {
              positions: {
                include: { instrument: true },
              },
            },
          },
        },
      });

      if (!user) {
        return reply.code(404).send({ error: "User not found" });
      }

      return {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
        accounts: user.accounts,
      };
    },
  );
}

export default register;
