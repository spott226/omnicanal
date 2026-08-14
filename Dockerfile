FROM node:24-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN npm ci --include=dev --no-audit --no-fund

COPY . .

RUN npm run db:generate && npm run build:api

EXPOSE 8080

CMD ["node", "apps/api/dist/apps/api/src/main.js"]
