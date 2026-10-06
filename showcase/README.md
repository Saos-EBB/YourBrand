# Showcase

Derselbe Ablauf für jeden laufenden Mandanten — Screenshots pro Schritt, ein Video pro Mandant
und Vergleiche nebeneinander. Zeigt, dass es **eine** Codebasis ist, die sich pro Mandant anders
verhält: Marke, Theme, Sprache, Module.

```bash
scripts/tenant.sh up all                  # Mandanten starten (Repo-Root)
cd showcase
npm install && npx playwright install chromium   # einmalig
npm run showcase                          # alle laufenden Mandanten (+ default, falls erreichbar)
npm run showcase -- kiez underground      # nur diese
npm run showcase -- --compose-only        # nur Vergleiche aus out/ neu bauen
```

## Ablauf

| # | Schritt | wann |
|---|---|---|
| 01 | Login (Persona tippt E-Mail/Passwort) | immer |
| 02 | DSGVO-Zustimmung (AGB + Datenschutz) | erster Login nach dem Seed |
| 03 | Dashboard | immer |
| 04 | Chat-Liste | Modul `chat` |
| 05 | Chat geöffnet | Modul `chat` |
| 06 | Discover | Modul `matching` |
| 07 | Hidden Zone: 6× aufs Logo, Passwort, Tab „Public“ | Modul `hidden` |
| 08 | Einstellungen (Sprachen, ggf. Abo) | immer |

Welche Schritte laufen, entscheidet die Config des Mandanten (`GET /api/v1/tenant`) — nicht das Skript.
Wer sich einloggt und welchen Chat der Ablauf öffnet, steht in `personas.json`.

## Ergebnis (`out/`, gitignored)

- `out/<slug>/NN-<schritt>.png` und `out/<slug>/ablauf.webm`
- `out/vergleich-NN-<schritt>.png` — alle Mandanten, die den Schritt haben, im Raster
- `out/vergleich.mp4` — bis zu vier Videos 2×2 nebeneinander (nur mit installiertem `ffmpeg`)

Die Next.js-Dev-Anzeige wird im Showcase ausgeblendet. Für die Zustimmung als eigenen Schritt:
Showcase direkt nach `scripts/tenant.sh up` laufen lassen (Seeds setzen den Demo-Zustand zurück).
