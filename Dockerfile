FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund
COPY . .
RUN node --experimental-strip-types scripts/export-menu.mjs && npm run build
ARG SOURCE_COMMIT
RUN DEPLOY_SHA="$SOURCE_COMMIT" node scripts/prepare-release.mjs && npm prune --omit=dev --legacy-peer-deps --no-audit --no-fund

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/.release/ ./
COPY --from=build --chown=node:node /app/node_modules/ ./node_modules/
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=4s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server-launch.cjs"]
