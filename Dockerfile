FROM oven/bun:1 AS build
WORKDIR /src

COPY package.json bun.lock ./
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
COPY packages/extension/package.json packages/extension/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

COPY . .
RUN bun run --cwd packages/web build
RUN bun build packages/server/src/index.ts --target=bun --external vite --outfile=/out/server.js
RUN bun build packages/server/src/scripts/create-user.ts --target=bun --outfile=/out/create-user.js

FROM oven/bun:1-slim
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    STATIC_DIR=/app/public

COPY --from=build /out/server.js /out/create-user.js ./
COPY --from=build /src/packages/web/dist ./public

RUN mkdir -p /data && chown bun:bun /data
VOLUME /data
USER bun

EXPOSE 3000
CMD ["bun", "server.js"]
