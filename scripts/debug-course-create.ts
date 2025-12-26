
import axios from 'axios';

const BASE_URL = 'http://localhost:3030';
const ADMIN_EMAIL = "vastuarunsharma105@gmail.com";
const ADMIN_PASS = "arun@sharma105";

async function run() {
    console.log('🔄 Starting Debug Course Create...');

    try {
        // 1. Login
        console.log(`\n🔑 Logging in as ${ADMIN_EMAIL}...`);
        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            email: ADMIN_EMAIL,
            password: ADMIN_PASS
        });

        if (!loginRes.data.data.token) {
            throw new Error('No token returned from login');
        }
        const token = loginRes.data.data.token;
        const userId = loginRes.data.data.user.id;
        console.log('✅ Login Successful.');

        // 2. Create Course (Mocking S3 flow - skipping actual S3 upload, just sending metadata)
        console.log('\n📝 specific Course Creation...');

        // Use a dummy key - we don't need real S3 file for database entry
        const dummyS3Key = `vastu-courses/images/${Date.now()}-test-thumb.jpg`;

        const courseData = {
            title: "Debug S3 Course " + Date.now(),
            description: "Created via debug script",
            price: "999",
            instructorId: userId,
            s3Key: dummyS3Key,
            s3Bucket: "vastu-media-prod" // Using the bucket name we saw in previous test
        };

        const createRes = await axios.post(
            `${BASE_URL}/api/instructor/courses`,
            courseData,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        console.log('✅ Course Created Successfully!');
        console.log('Response:', createRes.data);

    } catch (error: any) {
        console.error('\n❌ Error:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error('Data:', error.response.data);
        } else {
            console.error(error.message);
        }
    }
}

run();
