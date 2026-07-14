# ---- Stage 1: Build ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm install
RUN npx prisma generate
COPY src ./src
RUN npm run build

# ---- Stage 2: Run ----
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma
COPY prisma.config.ts ./

EXPOSE 3004
CMD ["node", "dist/index.js"]
