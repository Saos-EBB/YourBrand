# Fehler

## 2026-10-10 — ts-node-Script ausserhalb von backend/ laeuft still nicht
**Symptom:** Ein Testscript im Scratchpad (`/tmp/...`) mit Imports aus `backend/src`: erst „Cannot find module
'typeorm'“, mit absoluten Pfaden dann ESM-Fehler, mit `{"type":"commonjs"}` daneben Exit 0 ohne jede Ausgabe.
**Ursache:** ausserhalb des Pakets greifen weder `backend/node_modules` noch `backend/tsconfig.json` (Modul-Modus);
warum der letzte Lauf gar nichts ausfuehrt, ist unklar.
**Fix:** Wegwerf-Scripts unter `backend/.claude/` ablegen (gitignored) und danach loeschen.
