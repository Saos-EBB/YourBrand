#!/bin/sh
set -e

# Oeffentliche Demo mit offener Registrierung: jeder Neustart soll wieder der
# kuratierte Ausgangszustand sein. Loescht jeden User ausserhalb von
# demo-users.yaml (echte Registrierungen + alte seed_user_*), inkl. ihrer
# Object-Storage-Dateien. Laeuft immer, nicht SEED_RESET-gesteuert — siehe
# demo-full-reset.ts fuer den Grund.
npx ts-node -r tsconfig-paths/register src/database/seeds/demo-full-reset.ts

# demo-seed and demo-relations-seed are idempotent (skip existing
# nicknames/emails/beef pairs) — no-op on an already-seeded volume.
# seed-cities always truncates+reloads cities from the CSV (pure reference
# data, nothing else has an FK on it), so it stays in sync with the CSV on
# every restart. backfill-profile-locations only touches profiles with no
# location set yet, so it's a no-op once everything is backfilled.
# Demo beefs get ends_at = NOW() + 8h at seed time, so re-running this on a
# fresh volume always produces currently-active beefs, not stale ones.
# seed-cities must run before backfill-profile-locations, which looks up
# lat/lng from the cities table to set profiles.location.
npx ts-node -r tsconfig-paths/register src/database/seeds/demo-seed.ts
npx ts-node -r tsconfig-paths/register src/database/seeds/demo-relations-seed.ts

# seed-extra-users/seed-coin-transactions/seed-subscriptions-payments/seed-media
# are SEED_USERS/SEED_TX_PER_USER/SEED_MEDIA_PER_USER-gesteuert (default 0 = no-op)
# und idempotent (per-User-Check, skip wenn schon vorhanden). SEED_RESET=true
# loescht ihre jeweiligen Daten zuerst und baut sie neu auf. seed-extra-users
# muss vor den anderen dreien laufen, damit deren "alle User"-Query auch die
# frisch angelegten Fake-User sieht.
npx ts-node -r tsconfig-paths/register src/database/seeds/seed-extra-users.ts
npx ts-node -r tsconfig-paths/register src/database/seeds/seed-coin-transactions.ts
npx ts-node -r tsconfig-paths/register src/database/seeds/seed-subscriptions-payments.ts
npx ts-node -r tsconfig-paths/register src/database/seeds/seed-media.ts

npx ts-node -r tsconfig-paths/register src/database/seeds/seed-cities.ts
npx ts-node -r tsconfig-paths/register src/database/seeds/backfill-profile-locations.ts

exec npm run start:dev
