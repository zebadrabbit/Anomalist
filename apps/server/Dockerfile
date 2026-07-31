FROM node:22-alpine AS builder
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

FROM node:22-alpine AS production
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

# Created in the image rather than left to the volume driver: a plain "docker run"
# with no volumes has to work too, and Docker seeds a fresh named volume with the
# ownership of the directory it shadows, which is how the node user keeps write
# access to /app/data and /app/media.
RUN mkdir -p /app/data /app/media && chown node:node /app/data /app/media

ENV NODE_ENV=production
# Point at the two writable directories. Without these the server falls back to
# ./anomalist.db and ./media under the root-owned /app, which node cannot write.
ENV DB_PATH=/app/data/anomalist.db
ENV MEDIA_DIR=/app/media
EXPOSE 3001

# node:alpine ships this uid 1000 user. Existing deployments have root-owned
# named volumes and need a one-time chown — see docs/guide/getting-started.md.
USER node

CMD ["node", "apps/server/dist/index.js"]
