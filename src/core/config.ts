import dotenv from 'dotenv';
dotenv.config();

export const config = {
    port: process.env.PORT || 3000,
    jwtSecret: process.env.JWT_SECRET || 'super-secret-key',
    databaseUrl: process.env.DATABASE_URL,
};
