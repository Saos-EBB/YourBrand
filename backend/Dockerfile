# Zwei Ziele aus einem Dockerfile:
#   dev  (Default, letztes Ziel): wie bisher, docker-entrypoint.sh mit Full-Reset + Seeds, dann start:dev.
#        Alle Compose-Dateien (Demo, Loadtest, Tenant) bauen ohne target und bekommen weiter dieses Ziel.
#   prod (docker build --target prod): kompiliertes dist/, nur Laufzeit-Abhaengigkeiten, node dist/main,
#        keine Seeds und kein Reset. Worker: dasselbe Image mit command ["node", "dist/worker"].
#        Migrationen laufen ueber das DB-Image (db/Dockerfile), nicht hier.

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main"]

FROM node:20-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN chmod +x docker-entrypoint.sh
EXPOSE 3000
# Demo-Daten seeden (idempotent) und Dev-Server mit Hot-Reload starten.
# Ueber "sh" statt direkt als relativer Pfad, weil das Basis-Image sein
# eigenes ENTRYPOINT docker-entrypoint.sh mitbringt, das per `command -v`
# prueft ob CMD ein bekannter Befehl ist — wegen eines ash/dash-Bugs
# (https://bugs.debian.org/cgi-bin/bugreport.cgi?bug=874264) erkennt das
# einen relativen Pfad wie "./docker-entrypoint.sh" nicht zuverlaessig und
# faellt auf `node ./docker-entrypoint.sh` zurueck, was crasht.
CMD ["sh", "./docker-entrypoint.sh"]
