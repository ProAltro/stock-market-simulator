import bcrypt from "bcrypt";

export async function register(fastify, opts) {
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

      const existingUser = await fastify.prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return reply.code(409).send({ error: "Email already registered" });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const user = await fastify.prisma.user.create({
        data: {
          email,
          passwordHash,
          displayName: displayName || email.split("@")[0],
        },
      });

      const token = fastify.jwt.sign({
        userId: user.id,
        email: user.email,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          createdAt: user.createdAt,
        },
        token,
      };
    }
  );

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
          displayName: user.displayName,
          createdAt: user.createdAt,
        },
        token,
      };
    }
  );

  fastify.get(
    "/me",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const user = await fastify.prisma.user.findUnique({
        where: { id: request.user.userId },
        select: {
          id: true,
          email: true,
          displayName: true,
          createdAt: true,
        },
      });

      if (!user) {
        return reply.code(404).send({ error: "User not found" });
      }

      return user;
    }
  );

  fastify.patch(
    "/me",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: "object",
          properties: {
            displayName: { type: "string", minLength: 1, maxLength: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      const { displayName } = request.body;

      const user = await fastify.prisma.user.update({
        where: { id: request.user.userId },
        data: { displayName },
        select: {
          id: true,
          email: true,
          displayName: true,
          createdAt: true,
        },
      });

      return user;
    }
  );
}

export default register;
