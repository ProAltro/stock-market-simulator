import { PrismaClient } from '@prisma/client';
import fp from 'fastify-plugin';

async function prismaPlugin(fastify, options) {
  const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' 
      ? ['query', 'info', 'warn', 'error']
      : ['error']
  });

  await prisma.$connect();
  
  fastify.decorate('prisma', prisma);
  
  fastify.addHook('onClose', async (instance) => {
    await instance.prisma.$disconnect();
  });
}

export default fp(prismaPlugin, { name: 'prisma' });
