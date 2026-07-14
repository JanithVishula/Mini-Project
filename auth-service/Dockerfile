# ---- Stage 1: Build ----
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests first (for layer caching)
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# Install ALL dependencies (including dev, needed to build)
RUN npm install

# Generate Prisma client
RUN npx prisma generate

# Copy the rest of the source and build
COPY src ./src
RUN npm run build

# ---- Stage 2: Run ----
FROM node:22-alpine

WORKDIR /app

# Copy only what's needed to RUN (not dev dependencies)
COPY package*.json ./
RUN npm install --omit=dev

# Copy the generated Prisma client and compiled output from the builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma
COPY prisma.config.ts ./

EXPOSE 3001

CMD ["node", "dist/index.js"]
