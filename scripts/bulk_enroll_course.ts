/**
 * Bulk enroll existing users into a course by email and mark payments as PAID.
 *
 * Usage:
 *   bun run bulk_enroll -- --courseId <uuid> [--emails email1@gmail.com,email2@gmail.com]
 *
 * If --emails is omitted, uses the default batch embedded below.
 */
import { prisma } from '../src/core/prisma';
import { EnrollmentRepository } from '../src/enrollment/enrollment.repository';

const DEFAULT_EMAILS = [
  'sbhatta543@gmail.com',
  'vijenderdhanda.mks@gmail.com',
  'parveenmakhija10@gmail.com',
  'janakipradhanj@gmail.com',
  '1981varunverma@gmail.com',
  'chiragarchana1471@gmail.com',
  'ashokirtibansal@gmail.com',
  'neetachheda05@gmail.com',
  'sibanandaprusty830@gmail.com',
  'prakashklassic@gmail.com',
  'airababbar@gmail.com',
  'ssayam200@gmail.com',
  'arunshrm86@gmail.com',
];

type Outcome = 'ENROLLED' | 'ALREADY_ENROLLED' | 'NOT_FOUND' | 'ERROR';

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

function usage(): never {
  console.error(`Usage:
  bun run bulk_enroll -- --courseId <uuid> [--emails email1@gmail.com,email2@gmail.com]`);
  process.exit(1);
}

function normalizeEmails(raw: string[]): string[] {
  return [...new Set(raw.map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

async function main() {
  const courseId = getArg('--courseId')?.trim();
  const emailsArg = getArg('--emails');

  if (!courseId) {
    usage();
  }

  const emails = normalizeEmails(
    emailsArg ? emailsArg.split(',') : DEFAULT_EMAILS,
  );

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      paymentPlans: { orderBy: { orderIndex: 'asc' } },
    },
  });

  if (!course) {
    console.error(`Course not found: ${courseId}`);
    process.exit(1);
  }

  console.log(`Course: ${course.title} (${course.id})`);
  console.log(`Payment plans: ${course.paymentPlans.length || 'Full Payment'}`);
  console.log(`Processing ${emails.length} email(s)...\n`);

  const results: { email: string; outcome: Outcome; serialNumber?: string; error?: string }[] = [];

  for (const email of emails) {
    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        results.push({ email, outcome: 'NOT_FOUND' });
        console.log(`NOT_FOUND  ${email}`);
        continue;
      }

      const hadEnrollment = !!(await EnrollmentRepository.findEnrollment(user.id, courseId));
      const enrollment = await EnrollmentRepository.createEnrollment(user.id, courseId);
      await EnrollmentRepository.markFullPayment(user.id, courseId, course);

      const outcome: Outcome = hadEnrollment ? 'ALREADY_ENROLLED' : 'ENROLLED';
      results.push({ email, outcome, serialNumber: enrollment.serialNumber ?? undefined });
      console.log(
        `${outcome.padEnd(18)} ${email} (serial: ${enrollment.serialNumber ?? 'n/a'})`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ email, outcome: 'ERROR', error: message });
      console.log(`ERROR      ${email}: ${message}`);
    }
  }

  const enrolled = results.filter((r) => r.outcome === 'ENROLLED').length;
  const alreadyEnrolled = results.filter((r) => r.outcome === 'ALREADY_ENROLLED').length;
  const notFound = results.filter((r) => r.outcome === 'NOT_FOUND').length;
  const errors = results.filter((r) => r.outcome === 'ERROR').length;

  console.log('\n--- Summary ---');
  console.log(
    `${results.length} processed, ${enrolled} enrolled, ${alreadyEnrolled} already enrolled, ${notFound} not found, ${errors} errors`,
  );

  if (notFound > 0 || errors > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Bulk enroll failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
