import { prisma } from "../core/prisma";
import bcrypt from 'bcryptjs';

async function createAdmin() {
    const email = "vastuarunsharma105@gmail.com";
    const password = "arun@sharma105";
    const name = "Arun Sharma";

    console.log(`Attempting to create admin: ${email}...`);

    try {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            console.log(`⚠️ User ${email} already exists.`);
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name,
                role: 'admin'
            }
        });
        console.log(`✅ Admin user created! ID: ${user.id}`);
    } catch (e) {
        console.error("❌ Error creating admin:", e);
    } finally {
        await prisma.$disconnect();
    }
}

createAdmin();
