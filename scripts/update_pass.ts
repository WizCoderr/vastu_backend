import bcrypt from 'bcryptjs';
import { prisma } from '../src/core/prisma';



async function main() {
  const email = 'janakipradhanjanaki@gmail.com';
  const password = '@janakip97';



  const hashedPassword = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    const user = await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
      },
    });

    console.log('Updated user:');
    console.log({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phoneNumber: user.phoneNumber,
    });
    return;
  }
}

main()
  .catch((err) => {
    console.error('Failed to create admin:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
