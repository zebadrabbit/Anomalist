FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY apps/overlay/package.json apps/overlay/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/widget-sdk/package.json packages/widget-sdk/package.json

RUN npm ci

COPY . .

RUN npm run build --workspace=packages/types
RUN npm run build --workspace=apps/dashboard
RUN npm run build --workspace=apps/overlay
RUN npm run build --workspace=apps/server

FROM node:20-alpine AS production
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY apps/overlay/package.json apps/overlay/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/widget-sdk/package.json packages/widget-sdk/package.json

RUN npm ci --omit=dev

COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/dashboard/build ./apps/dashboard/build
COPY --from=builder /app/apps/overlay/build ./apps/overlay/build
COPY --from=builder /app/packages/types/dist ./packages/types/dist

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "apps/server/dist/index.js"]
