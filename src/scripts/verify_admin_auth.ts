import { signToken } from '../core/jwt';
import { config } from '../core/config';

async function runVerification() {
    console.log('Admin Auth Verification Started...');

    const baseUrl = `http://localhost:${config.port}/api/instructor`;

    // 1. Generate Tokens
    const studentToken = signToken({ userId: 'student_123', role: 'student' });
    const adminToken = signToken({ userId: 'admin_123', role: 'admin' });

    console.log('Generated Student Token:', studentToken.substring(0, 20) + '...');
    console.log('Generated Admin Token:', adminToken.substring(0, 20) + '...');

    // 2. Test Cases
    const checks = [
        {
            name: 'No Token',
            token: null,
            expectedStatus: [401],
            body: {}
        },
        {
            name: 'Student Token',
            token: studentToken,
            expectedStatus: [403],
            body: {}
        },
        {
            name: 'Admin Token (Expected pass)',
            token: adminToken,
            expectedStatus: [201, 400], // 400 means Validated but Zod error (so Auth passed), 201 means Created
            body: {
                title: 'Test Course',
                price: '99',
                instructorId: 'admin_123'
            }
        }
    ];

    let allPassed = true;

    for (const check of checks) {
        console.log(`\n----------------------------------------`);
        console.log(`Testing: ${check.name}`);
        try {
            const headers: any = { 'Content-Type': 'application/json' };
            if (check.token) {
                headers['Authorization'] = `Bearer ${check.token}`;
            }

            const response = await fetch(`${baseUrl}/courses`, {
                method: 'POST',
                headers,
                body: JSON.stringify(check.body)
            });

            console.log(`Response Status: ${response.status}`);

            if (check.expectedStatus.includes(response.status)) {
                console.log('✅ Passed');
            } else {
                console.log(`❌ Failed. Expected ${check.expectedStatus.join(' or ')}, got ${response.status}`);
                const text = await response.text();
                console.log('Response body:', text);
                allPassed = false;
            }

        } catch (error) {
            console.error('❌ Request error:', error);
            allPassed = false;
        }
    }

    console.log(`\n----------------------------------------`);
    if (allPassed) {
        console.log('✨ All admin auth checks passed!');
        process.exit(0);
    } else {
        console.error('❌ Some checks failed.');
        process.exit(1);
    }
}

runVerification();
