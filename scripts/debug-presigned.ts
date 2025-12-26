
import axios from 'axios';

const BASE_URL = 'http://localhost:3030';
const ADMIN_EMAIL = "vastuarunsharma105@gmail.com";
const ADMIN_PASS = "arun@sharma105";

async function run() {
    console.log('🔄 Starting Debug Presigned URL...');

    try {
        // 1. Login
        console.log(`\n🔑 Logging in as ${ADMIN_EMAIL}...`);
        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            email: ADMIN_EMAIL,
            password: ADMIN_PASS
        });

        const token = loginRes.data.data.token;
        console.log('✅ Login Successful.');

        // 2. Request Presigned URL for Image
        console.log('\n📡 Requesting Presigned URL for Image...');

        const payload = {
            fileName: "frontend-debug-test.jpg",
            contentType: "image/jpeg",
            fileType: "image"
        };

        const presignRes = await axios.post(
            `${BASE_URL}/api/instructor/upload/presigned-url`,
            payload,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        console.log('✅ Presigned URL Generated Successfully!');
        console.log('Response:', presignRes.data);

    } catch (error: any) {
        console.error('Error:', error.message);
        if (error.response) console.error(error.response.data);
    }
}

run();
