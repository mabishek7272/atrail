import { PrismaClient } from './src/generated/client/index.js';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'm.abishek7272@gmail.com';
  const newPassword = 'Pass@12345';
  
  const hash = await bcrypt.hash(newPassword, 12);
  
  await prisma.user.update({
    where: { email },
    data: { passwordHash: hash }
  });
  
  console.log(`Password for ${email} reset to ${newPassword}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
