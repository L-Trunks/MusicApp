FROM node:20-slim AS builder

WORKDIR /app

# 安装 OpenSSL（Prisma schema engine 依赖）
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

COPY tsconfig.json ./
COPY src ./src/
RUN npx prisma generate
# 构建时提高 Node 堆内存上限，避免 tsc 在低内存环境下 OOM
ENV NODE_OPTIONS=--max-old-space-size=2048
RUN npm run build

# ---- Production image ----
FROM node:20-slim AS runner

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma/

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
