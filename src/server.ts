import app from './app';
import { config } from './core/config';
import { prisma } from "./core/prisma"

async function main() {
    try {
        // Check DB connection
        await prisma.$connect();
        console.log('✅ Database connected');

        app.listen(config.port, () => {
            console.log(`🚀 Server running on port ${config.port}`);
        });
    } catch (error) {
        console.error('❌ Server failed to start:', error);
        process.exit(1);
    }
}

main();
