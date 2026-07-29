/**
 * Create a new admin user, or promote an existing user to admin.
 *
 * Usage:
 *   bun run create_admin -- --email admin@example.com --password 'secret' --phone '+919999999999' [--name 'Admin']
 *
 * If the email already exists, the password is updated and role is set to admin.
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/core/prisma';

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

function usage(): never {
  console.error(`Usage:
  bun run create_admin -- --email <email> --password <password> --phone <phone> [--name <name>]`);
  process.exit(1);
}

async function main() {
  const email = getArg('--email')?.trim().toLowerCase();
  const password = getArg('--password');
  const phoneNumber = getArg('--phone')?.trim();
  const name = getArg('--name')?.trim() || 'Admin';

  if (!email || !password || !phoneNumber) {
    usage();
  }

  if (password.length < 6) {
    console.error('Password must be at least 6 characters.');
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    const user = await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        phoneNumber,
        name,
        role: 'admin',
      },
    });

    console.log('Updated existing user to admin:');
    console.log({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phoneNumber: user.phoneNumber,
    });
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      phoneNumber,
      name,
      role: 'admin',
    },
  });

  console.log('Created admin user:');
  console.log({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    phoneNumber: user.phoneNumber,
  });
}

main()
  .catch((err) => {
    console.error('Failed to create admin:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
