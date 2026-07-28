import { PrismaClient } from "@prisma/client";
import { seedDemo, DEMO_ORGANIZATION_SLUG } from "./seed";

const prisma = new PrismaClient();
async function reset() {
  if (process.env.NODE_ENV === "production") throw new Error("demo:reset está bloqueado en producción");
  const organization = await prisma.organization.findUnique({ where: { slug: DEMO_ORGANIZATION_SLUG } });
  if (organization && organization.mode !== "DEMO") throw new Error("Protección activa: la organización no es DEMO");
  if (organization) await prisma.organization.delete({ where: { id: organization.id } });
  return seedDemo();
}
reset().then((result) => console.log("Demo restablecida", result)).finally(() => prisma.$disconnect());
