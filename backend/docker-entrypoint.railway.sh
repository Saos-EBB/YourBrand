#!/bin/sh
set -e

# Prod-Entrypoint fuer Railway. Unterschiede zu docker-entrypoint.sh (lokal):
#   - laeuft den kompilierten Build (node dist/main) statt nest --watch
#   - wartet vorher auf die DB und legt bei Bedarf das Schema an, weil
#     Railway kein `depends_on: service_healthy` kennt (siehe ensure-db.js)
#
# Die Seeds selbst sind dieselben Skripte in derselben Reihenfolge wie lokal
# und ueber ts-node ausgefuehrt — nicht als kompiliertes dist/, weil sie ihre
# YAML/CSV-Dateien ueber __dirname neben der Quelldatei suchen und tsc diese
# Assets nicht nach dist/ kopiert.

node scripts/deploy/ensure-db.js

# Standard true: dieses Image ist der Demo-Deploy, der bei jedem Boot seine
# Demo-User braucht. Auf false setzen, wenn es je gegen eine echte DB laeuft —
# die Seeds sind zwar idempotent, haben in Prod aber nichts verloren.
if [ "${SEED_ON_BOOT:-true}" = "true" ]; then
  echo "--- Seeds ---"
  npx ts-node -r tsconfig-paths/register src/database/seeds/demo-seed.ts
  npx ts-node -r tsconfig-paths/register src/database/seeds/demo-relations-seed.ts

  npx ts-node -r tsconfig-paths/register src/database/seeds/seed-extra-users.ts
  npx ts-node -r tsconfig-paths/register src/database/seeds/seed-coin-transactions.ts
  npx ts-node -r tsconfig-paths/register src/database/seeds/seed-subscriptions-payments.ts
  npx ts-node -r tsconfig-paths/register src/database/seeds/seed-media.ts

  npx ts-node -r tsconfig-paths/register src/database/seeds/seed-cities.ts
  npx ts-node -r tsconfig-paths/register src/database/seeds/backfill-profile-locations.ts
else
  echo "--- Seeds uebersprungen (SEED_ON_BOOT=$SEED_ON_BOOT) ---"
fi

exec node dist/main
