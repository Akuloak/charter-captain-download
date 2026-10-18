# Charter Captain: Mediterranean – Testversion

Boots-Charter-Simulator für bis zu 4 Spieler. Hier gibt es nur die fertige Windows-Version zum Testen (kein Quellcode).

## Im Browser spielen

Die Browser-Version läuft auf Render – Link öffnen, kurz laden lassen (beim ersten Mal 1–2 Minuten), spielen.
Einrichten (einmalig, für den Besitzer): [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Akuloak/charter-captain-download)

## Download (PC, volle Grafik)

Unter **[Releases](../../releases/latest)** die Datei `CharterCaptain_Windows.zip` herunterladen und entpacken.

## Zusammen spielen (Raum-Code)

1. Host: *Mehrspieler* → *Raum erstellen* → den 4-stelligen Code an die Freunde schicken.
2. Freunde: *Mehrspieler* → Code eingeben → *Mit Code beitreten* (im Browser oder in der PC-Version).
3. Host startet das Spiel für alle.

### Alternative: per IP über Tailscale (nur PC-Version)

1. Alle installieren [Tailscale](https://tailscale.com/download) und melden sich an. Der Host lädt die anderen in sein Tailscale-Netz ein.
2. `CharterCaptain.exe` starten. Bei der Windows-Warnung: „Weitere Informationen“ → „Trotzdem ausführen“.
3. **Host:** *Mehrspieler* → *Hosten*, Firewall erlauben, die Adresse mit **100.** an die Freunde schicken.
4. **Freunde:** *Mehrspieler* → 100.-Adresse eintragen → *Beitreten*.
5. Host startet das Spiel für alle.
