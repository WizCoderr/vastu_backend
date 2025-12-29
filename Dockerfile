# Start from Bun image
FROM oven/bun:1

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN bun install

# Copy prisma schema
COPY prisma ./prisma/

# Generate prisma client
RUN bun run prisma generate

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Copy environment file (if needed)
COPY .env* ./

# Start the application
CMD ["bun", "run", "dev"]