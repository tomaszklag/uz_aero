# UZ Aero — obraz produkcyjny serwera (API + statyczny build panelu; Railway/Docker).
#
# Monorepo npm workspaces, więc obie instalacje jadą `npm ci -w …` z JEDNEGO lockfile'a
# w korzeniu — bez workspace'u `app/` (Expo to setki MB, których serwer nie potrzebuje).
# Manifest `app/package.json` MUSI jednak być w obrazie budowania: npm czyta mapę
# workspace'ów z korzenia i bez niego odmawia jakiejkolwiek instalacji.
#
# Serwer działa przez tsx (TypeScript bez kroku budowania — jak `npm run start`),
# dlatego `tsx` jest w dependencies serwera, a runtime instaluje `--omit=dev`.

# ── etap 1: build panelu (Vite, base '/admin/') ──────────────────────────────
FROM node:22-alpine AS admin-build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY app/package.json app/
COPY admin/package.json admin/
COPY server/package.json server/
COPY packages/domain/package.json packages/domain/
COPY packages/tokens/package.json packages/tokens/
COPY packages/format/package.json packages/format/
RUN npm ci -w admin -w packages/domain -w packages/tokens -w packages/format

COPY packages/ packages/
COPY admin/ admin/
RUN npm run build -w admin

# ── etap 2: runtime (API + admin/dist) ───────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY app/package.json app/
COPY admin/package.json admin/
COPY server/package.json server/
COPY packages/domain/package.json packages/domain/
COPY packages/tokens/package.json packages/tokens/
COPY packages/format/package.json packages/format/
RUN npm ci -w server -w packages/domain -w packages/tokens -w packages/format --omit=dev

COPY packages/ packages/
COPY server/ server/
COPY --from=admin-build /repo/admin/dist admin/dist

# Ścieżki wewnątrz obrazu; resztę środowiska (DATABASE_URL, JWT_SECRET, PUBLIC_BASE_URL,
# TRUST_PROXY=1, PORT) podaje hosting. `TRACES_DIR` celowo na /data — tam montuje się
# trwały wolumen: po issue #47 kopia śladu GPS na serwerze jest JEDYNĄ kopią.
ENV ADMIN_DIST_DIR=/repo/admin/dist
ENV TRACES_DIR=/data/traces

EXPOSE 3000
CMD ["node_modules/.bin/tsx", "server/src/index.ts"]
