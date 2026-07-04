# Worker image: Node 22 + pnpm pinned to the workspace's packageManager
# version, installed via npm to avoid the corepack/pnpm 11 incompatibility
# seen on Nixpacks (ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING).
FROM node:22-slim

WORKDIR /app

# sourceRef: package.json "packageManager": "pnpm@11.9.0"
RUN npm install -g pnpm@11.9.0

COPY . .
RUN pnpm install --frozen-lockfile

CMD ["pnpm", "--filter", "@calledit/worker", "start"]
