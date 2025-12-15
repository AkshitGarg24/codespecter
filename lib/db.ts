import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL
})

const prismeClientSingleton = () => {
    return new PrismaClient({ adapter    })
}

declare const globalThis: {
    prismaGlobal: ReturnType<typeof prismeClientSingleton>;
} & typeof global;

const prisma = globalThis.prismaGlobal || prismeClientSingleton();

if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma;

export default prisma;