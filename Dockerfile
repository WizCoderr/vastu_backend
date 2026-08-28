# Start from Bun image
FROM oven/bun:1

WORKDIR /app

# Chromium for whatsapp-web.js / Puppeteer (use system browser, skip bundled download)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgdk-pixbuf-2.0-0 \
    libglib2.0-0 \
    libgobject-2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/* \
    && if [ ! -e /usr/bin/chromium ] && [ -e /usr/bin/chromium-browser ]; then \
         ln -s /usr/bin/chromium-browser /usr/bin/chromium; \
       fi \
    && test -x /usr/bin/chromium || test -x /usr/bin/chromium-browser

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies (PUPPETEER_SKIP_CHROMIUM_DOWNLOAD must be set before install)
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
