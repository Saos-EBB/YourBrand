# Deployment: Vercel-Frontend + lokales Backend hinter ngrok (Option A)

Stand: 2026-09-15. Alternative zum Railway-Pfad (`docs/deployment/railway.md`):
Frontend dauerhaft auf Vercel, Backend/Postgres/PostGIS laeuft lokal per
`docker compose` auf der Fedora-Maschine und wird per ngrok Static Domain nach
aussen getunnelt. Kein Cloudflare, keine eigene Domain. Die Maschine wird
abends per `systemctl suspend` schlafen gelegt und morgens um 06:00 automatisch
wieder geweckt — **kein automatisches Ausschalten**.

## Warum ngrok statt Cloud-Hosting

Diese Variante ist fuer eine Portfolio-Demo gedacht, bei der das Backend nicht
dauerhaft laufen muss — nur wenn jemand tatsaechlich reinschaut. Das Frontend
(`OfflineFallback`, siehe `frontend/docs/build-log.md`) faengt die Zeiten ab, in
denen das Backend offline ist.

## Uebersicht der Env-Vars

| Var | Wo | Wert |
|---|---|---|
| `CORS_ORIGIN` | `backend/.env` | komma-separiert: `http://localhost:3001,<Vercel-URL>,https://saos-repo.vercel.app` |
| `NEXT_PUBLIC_API_URL` | Vercel Project Settings | `https://<static-domain>.ngrok-free.app/api/v1` |
| `NEXT_PUBLIC_WS_URL` | Vercel Project Settings | `wss://<static-domain>.ngrok-free.app` |
| `BACKEND_INTERNAL_URL` | Vercel Project Settings | `https://<static-domain>.ngrok-free.app` (ohne `/api/v1` — nur der `/uploads`-Rewrite in `next.config.ts` braucht das) |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Vercel Project Settings | eigene Bewerbungs-/Kontakt-Mail |
| `NEXT_PUBLIC_DEMO_VIDEO_URL` | Vercel Project Settings | Loom-Link |
| `NEXT_PUBLIC_CONTACT_FORM_ENDPOINT` | Vercel Project Settings | leer = mailto (Default), oder Web3Forms/Formspree-Endpoint |

`backend/.env.example` und `frontend/.env.example` haben dieselben Keys mit
Platzhaltern.

## 1. ngrok (MANUELL)

1. Account auf ngrok.com anlegen, **eine** Static Domain reservieren (im Free
   Plan enthalten).
2. `ngrok config add-authtoken <token>` **als der Nutzer `saosgone`** ausfuehren
   (nicht als root) — `yourbrand-ngrok.service` laeuft mit `User=saosgone` und
   liest dessen `~/.config/ngrok/ngrok.yml`.
3. In `backend/deploy/systemd/yourbrand-ngrok.service` `<your-static-domain>`
   durch die reservierte Domain ersetzen.
4. Dieselbe Domain in `frontend`s Vercel-Env-Vars eintragen (`NEXT_PUBLIC_API_URL`,
   `NEXT_PUBLIC_WS_URL`, `BACKEND_INTERNAL_URL`). `CORS_ORIGIN` (Abschnitt 3,
   Schritt 5) braucht dagegen die **Vercel-URL**, nicht die ngrok-Domain — die
   ngrok-Domain ist der Backend-Zugang, `CORS_ORIGIN` ist die Frontend-Herkunft,
   die das Backend erlauben muss.

## 2. Fedora-Autostart (systemd)

Alle Units liegen unter `backend/deploy/systemd/`. Installation (einmalig, als
root):

```bash
sudo cp backend/deploy/systemd/yourbrand-ngrok.service /etc/systemd/system/
sudo cp backend/deploy/systemd/yourbrand-wake.service /etc/systemd/system/
sudo cp backend/deploy/systemd/yourbrand-wake.timer /etc/systemd/system/
sudo systemctl daemon-reload

# Docker: nach jedem Boot/Resume automatisch hochkommen
sudo systemctl enable docker

# ngrok-Tunnel dauerhaft aktiv
sudo systemctl enable --now yourbrand-ngrok.service

# Wake-Timer (weckt aus Suspend um 06:00, WakeSystem=true)
sudo systemctl enable --now yourbrand-wake.timer
```

Pruefen:

```bash
systemctl status yourbrand-ngrok.service
systemctl list-timers yourbrand-wake.timer
```

`wake-stack.sh` erwartet das Repo unter `/home/saosgone/Schreibtisch/YourBrand`
(fest verdrahtet, kein anderer Pfad auf dieser Maschine). Falls `ngrok` nicht
unter `/usr/bin/ngrok` liegt (`which ngrok` pruefen), den `ExecStart`-Pfad in
`yourbrand-ngrok.service` anpassen.

**Merker:** Abends `systemctl suspend` (NICHT `poweroff`/`hibernate`) — nur aus
Suspend weckt `yourbrand-wake.timer` (`WakeSystem=true`) die Maschine. Poweroff/
Hibernate wird vom Timer nicht geweckt.

## 3. Vercel (MANUELL)

1. Neues Projekt aus diesem Repo anlegen (Monorepo).
2. **Root Directory** = `frontend`.
3. Framework wird automatisch als Next.js erkannt — Install/Build-Command
   bleiben Standard (`npm install`, `npm run build`/`next build`). Kein
   `vercel.json` noetig.
4. Env-Vars aus der Tabelle oben eintragen.
5. Nach dem ersten Deploy: die Vercel-URL in `backend/.env`s `CORS_ORIGIN`
   ergaenzen und den Backend-Prozess neu starten.

## 4. Kontaktformular-Option (Web3Forms/Formspree)

`NEXT_PUBLIC_CONTACT_FORM_ENDPOINT` leer lassen = `OfflineFallback` zeigt einen
mailto-Link (Default, keine externe Abhaengigkeit). Gesetzt = zeigt stattdessen
ein kleines Name/Mail/Nachricht-Formular, das per POST an den Endpoint geht.
Funktioniert mit jedem Web3Forms- oder Formspree-kompatiblen Endpoint (beide
akzeptieren `multipart/form-data`-POSTs ohne eigenes Backend) — sinnvoll, weil
das auf der immer-online Vercel-Seite laeuft und auch benachrichtigt, wenn die
Fedora-Maschine gerade aus ist.

## Offene MANUELL-Punkte (Checkliste)

- [ ] ngrok-Account + Static Domain reservieren, `ngrok config add-authtoken`
- [ ] `<your-static-domain>` in `yourbrand-ngrok.service` eintragen
- [ ] Vercel-Projekt anlegen, Root Directory + Env-Vars setzen
- [ ] Vercel-URL in `backend/.env`s `CORS_ORIGIN` eintragen
- [ ] `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_DEMO_VIDEO_URL` mit echten Werten
      fuellen (aktuell Platzhalter in `frontend/.env.example`)
- [ ] Optional: `NEXT_PUBLIC_CONTACT_FORM_ENDPOINT` (Web3Forms/Formspree) setzen
- [ ] systemd-Units installieren + enablen (Abschnitt 2)
- [ ] Abends `systemctl suspend` zur Routine machen
