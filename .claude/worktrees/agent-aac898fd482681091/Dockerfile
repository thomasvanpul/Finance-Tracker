FROM node:24-slim

# Install the exact pnpm version that matches the lockfile
RUN npm install -g pnpm@11.12.0

WORKDIR /app

# Copy everything needed for the monorepo install + api-server build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/
COPY scripts/ ./scripts/

# --no-frozen-lockfile lets pnpm pick the correct Linux platform binaries
# (the lockfile was generated on macOS so platform-specific entries differ)
RUN pnpm install --no-frozen-lockfile --ignore-scripts && pnpm rebuild esbuild

RUN pnpm --filter @workspace/api-server run build

ENV NODE_ENV=production

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
