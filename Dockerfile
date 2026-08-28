# Start from Bun image
FROM oven/bun:1

WORKDIR /app

# Chromium for whatsapp-web.js / Puppeteer (use system browser, skip bundled download)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install

# Copy prisma schema
COPY prisma ./prisma/

# Generate prisma client
RUN bun run prisma generate

# Copy source code
COPY . .

# Copy environment file (if needed)
COPY .env* ./

# Start the application
CMD ["bun", "run", "start"]
