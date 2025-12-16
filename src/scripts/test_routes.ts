import { config } from '../core/config';

const BASE_URL = `http://localhost:${config.port}`;
let authToken = '';
const TEST_EMAIL = `test_${Date.now()}@example.com`;
const TEST_PASSWORD = 'password123';

async function testRoute(name: string, fn: () => Promise<boolean>) {
    process.stdout.write(`Testing ${name}... `);
    try {
        const result = await fn();
        if (result) {
            console.log('✅ PASS');
        } else {
            console.log('❌ FAIL');
        }
    } catch (error) {
        console.log('❌ ERROR', error);
    }
}

async function runTests() {
    console.log(`Starting API Tests on ${BASE_URL}\n`);

    // 1. Health Check
    await testRoute('Health Check (/health)', async () => {
        const res = await fetch(`${BASE_URL}/health`);
        return res.status === 200 && (await res.text()) === 'OK';
    });

    // 2. Register
    await testRoute('Auth Register (/auth/register)', async () => {
        const res = await fetch(`${BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Test Users',
                email: TEST_EMAIL,
                password: TEST_PASSWORD,
                role: 'student'
            })
        });
        const data = await res.json();
        if (res.status === 201 && data.success) {
            return true;
        }
        console.log('Register failed:', data);
        return false;
    });

    // 3. Login
    await testRoute('Auth Login (/auth/login)', async () => {
        const res = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: TEST_EMAIL,
                password: TEST_PASSWORD
            })
        });
        const data = await res.json();
        if (res.status === 200 && data.success && data.data?.token) {
            authToken = data.data.token;
            return true;
        }
        console.log('Login failed:', data);
        return false;
    });

    if (!authToken) {
        console.log('Skipping authenticated routes due to login failure.');
        return;
    }

    // 4. List Courses
    let firstCourseId = '';
    await testRoute('Student Courses List (/api/student/courses)', async () => {
        const res = await fetch(`${BASE_URL}/api/student/courses`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
            if (data.data.length > 0) {
                firstCourseId = data.data[0].id;
            }
            return true;
        }
        console.log('List courses failed:', data);
        return false;
    });

    if (firstCourseId) {
        // 5. Course Details
        await testRoute(`Student Course Details (/api/student/courses/${firstCourseId})`, async () => {
            const res = await fetch(`${BASE_URL}/api/student/courses/${firstCourseId}`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            return res.status === 200;
        });

        // 6. Curriculum
        await testRoute(`Student Curriculum (/api/student/courses/${firstCourseId}/curriculum)`, async () => {
            const res = await fetch(`${BASE_URL}/api/student/courses/${firstCourseId}/curriculum`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            return res.status === 200;
        });
    } else {
        console.log('Skipping course details tests (no courses found).');
    }

    // 7. Progress Update (Dry run, assuming some content ID might not exist but route should be protected)
    await testRoute('Student Progress Update (/api/student/progress/update) [Auth Check]', async () => {
        const res = await fetch(`${BASE_URL}/api/student/progress/update`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                courseId: 'dummy',
                contentId: 'dummy',
                completed: true
            })
        });
        // We expect 404 or 400 or 500 probably because IDs are fake, but NOT 401.
        // Actually, if we want to confirm the ROUTE exists and AUTH works, we check strictly for !401.
        return res.status !== 401;
    });

    console.log('\nTests Completed.');
}

runTests();
