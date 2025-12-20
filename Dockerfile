FROM oven/bun:1

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

COPY .env ./
# Install dependencies
RUN bun install --frozen-lockfile

# Copy prisma schema
COPY prisma ./prisma/

# Generate prisma client
RUN bun prisma generate

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Expose the port
EXPOSE 3000

# Start the application
CMD ["bun", "run", "src/server.ts"]
