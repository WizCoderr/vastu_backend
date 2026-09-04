# syntax=docker/dockerfile:1

FROM oven/bun:1.2.21 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

FROM base AS build
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
# prisma.config.ts requires DATABASE_URL; generate does not connect to the DB
ENV DATABASE_URL="postgres://8788cc239a826a2c7eb0c39472c4123f26a960c5c58fdf84899102cf03695ec5:sk_QvwQDYNssLOEpSQGv8XcO@pooled.db.prisma.io:5432/postgres?sslmode=verify-full"
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY package.json bun.lock* ./
RUN ./node_modules/.bin/prisma generate

FROM base AS runtime
ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
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
       fi

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/src/generated ./src/generated
COPY package.json bun.lock* ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY src ./src/
COPY docker/entrypoint-api.sh /entrypoint-api.sh

RUN chmod +x /entrypoint-api.sh \
    && mkdir -p storage/invoices uploads .wwebjs_auth \
    && addgroup --system vastu \
    && adduser --system --ingroup vastu vastu \
    && chown -R vastu:vastu /app

USER vastu
EXPOSE 3030

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3030/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/entrypoint-api.sh"]
CMD ["bun", "run", "src/index.ts"]
