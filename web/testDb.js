import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("Connecting to Database...");
  try {
    const count = await prisma.shop.count();
    console.log(`Successfully connected! Found ${count} shops.`);
    const shops = await prisma.shop.findMany();
    console.log(shops);
  } catch (err) {
    console.error("Database connection failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
