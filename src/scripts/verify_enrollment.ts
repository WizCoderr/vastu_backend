import { prisma } from "../core/prisma";
/* import { config } from "../config"; */

// Hardcoding or trying to import config. 
// If config is not found easily, fallback to 3000 or env.
const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}/api`;
const AUTH_URL = `http://localhost:${PORT}/auth`;

async function main() {
    console.log("Starting verification...");

    // 1. Ensure admin exists
    // We assume admin@edu.com / password exists or we create it.
    // Ideally we run create_admin.ts first, but let's just try login.

    // 2. Login as admin
    const adminRes = await fetch(`${AUTH_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@edu.com', password: 'password' })
    });

    if (!adminRes.ok) {
        console.error("Failed to login as admin", await adminRes.text());
        return;
    }

    const json = await adminRes.json();
    const token = json.data?.token;
    if (!token) {
        console.error("Failed to get token", json);
        return;
    }
    console.log("Admin logged in.");

    // 3. Create test data directly in DB
    const student = await prisma.user.create({
        data: {
            email: `test_student_${Date.now()}@test.com`,
            password: 'password',
            name: 'Test Student',
            role: 'student'
        }
    });

    const course = await prisma.course.create({
        data: {
            title: `Test Course ${Date.now()}`,
            price: '100',
            instructorId: 'admin_id_placeholder',
            published: true
        }
    });

    console.log(`Created student ${student.id} and course ${course.id}`);

    // 4. Call enroll API
    const enrollRes = await fetch(`${BASE_URL}/admin/enroll`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId: student.id, courseId: course.id })
    });

    if (enrollRes.status === 200) {
        console.log("✅ Enrollment API succeeded");
        const json = await enrollRes.json();
        console.log(json);
    } else {
        console.error("❌ Enrollment API failed", await enrollRes.text());
    }

    // 6. Test List Students
    const listRes = await fetch(`${BASE_URL}/admin/students`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    });

    if (listRes.ok) {
        console.log("✅ List Students API succeeded");
        const students = await listRes.json();
        console.log(`Found ${students.length} students`);
        // Verify we see the student we created
        const found = students.find((s: any) => s.id === student.id);
        if (found) console.log("✅ Created student found in list");
        else console.error("❌ Created student NOT found in list");
    } else {
        console.error("❌ List Students API failed", await listRes.text());
    }

    // 7. Cleanup
    await prisma.enrollment.deleteMany({
        where: { userId: student.id, courseId: course.id }
    });
    await prisma.course.delete({ where: { id: course.id } });
    await prisma.user.delete({ where: { id: student.id } });
    console.log("Cleanup done.");
    await prisma.$disconnect();
}

main();
