import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@example.com";
  const plainPassword = "password123";

  console.log(`Seeding Super Admin...`);
  
  // Hash the password
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);

  // Upsert to avoid duplicates if run multiple times
  const admin = await prisma.superAdmin.upsert({
    where: { email },
    update: {
      password: hashedPassword, // Ensure the password is reset/updated if it already exists
    },
    create: {
      email,
      password: hashedPassword,
      name: "Master Admin",
    },
  });

  console.log(`Super Admin seeded successfully!`);
  console.log(`Email: ${admin.email}`);
  console.log(`Password: ${plainPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
