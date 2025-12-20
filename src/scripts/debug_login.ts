import { config } from '../core/config';

async function debugLogin() {
    const email = "admin@edu.com";
    const password = "password";
    const url = `http://localhost:${config.port}/auth/login`;

    console.log(`Debug: Attempting login to ${url} with ${email}`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        console.log(`Status: ${response.status}`);
        const text = await response.text();
        console.log(`Body: ${text}`);

        if (response.status === 500) {
            console.log("🔥 Server returned 500 Internal Server Error - likely the crash source.");
        } else if (response.status === 200) {
            console.log("✅ Login successful. Backend seems fine. Logic error might be in frontend parsing?");
        }

    } catch (e) {
        console.error("❌ Request failed:", e);
    }
}

debugLogin();
