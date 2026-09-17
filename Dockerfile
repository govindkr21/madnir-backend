# Lightweight single-stage image (Alpine). Supports both dev (nodemon) and
# prod (node) via entrypoint.sh + the MODE env var — same pattern as nitrox.
FROM node:20-alpine

WORKDIR /app

# pnpm to match the project's pnpm-lock.yaml
RUN npm i -g pnpm@9

# Install deps first for better layer caching. We install ALL deps (incl.
# nodemon) so the one image works for both dev and prod.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --no-frozen-lockfile

COPY . .
RUN chmod +x /app/entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/app/entrypoint.sh"]
