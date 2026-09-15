#!/bin/sh
# Von yourbrand-wake.service ausgefuehrt (nach dem Aufwachen aus systemctl
# suspend um 06:00). docker compose up -d ist idempotent — startet nur was
# nicht schon laeuft, der Rest ueberlebt den Suspend im RAM. Der Restart des
# ngrok-Tunnels ist der eigentlich noetige Teil: eine lang laufende
# TCP-Verbindung uebersteht einen Suspend/Resume-Zyklus nicht zuverlaessig.
set -e
cd /home/saosgone/Schreibtisch/YourBrand
docker compose up -d
systemctl restart yourbrand-ngrok.service
