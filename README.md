# Content Challenge (live versie)

De game met echte logins. Docenten nodigen studenten uit per e-mail, alles wat studenten invullen staat in de database (Supabase), niet meer in de browser.

## Bestanden

| Bestand | Wat het is |
|---|---|
| `index.html` | De game, met inlogscherm. |
| `beheer.html` | Docentendashboard: uitnodigen, voortgang, werk bekijken, verwijderen, CSV. |
| `config.js` | **Hier vul je de Supabase-gegevens in** (Project URL en anon/publishable key). Leeg = demomodus. |
| `cloud.js` | Praat met de database. |
| `live.js`, `live.css` | Inloggen, laden en automatisch opslaan. |
| `vendor/supabase.js` | Supabase-bibliotheek (versie 2.117.3), lokaal zodat de site niet van een andere server afhangt. |
| `supabase/setup.sql` | Database-opzet. Eén keer draaien in de SQL Editor van Supabase. |
| `supabase/studio.sql` | Studio's vullen automatisch per 4 (de database telt mee). Eén keer draaien, na `setup.sql`. Verplaatsen kan in het dashboard. |
| `supabase/noodplan.sql` | Schakelaar voor het noodplan (tabel `instellingen`). Eén keer draaien; zit ook in `setup.sql`. |
| `noodplan.html`, `noodplan.pdf` | Noodkaarten L1-L6 voor als de game vastloopt. Werkt zonder inloggen. |
| `supabase/mail-*.html` | Teksten voor de uitnodigings- en inlogmail. |
| `tools/bouw-live.py` | Zet een nieuwe versie van het prototype om naar `index.html`. |
| `tools/prototype.html` | De prototypeversie waar deze live versie op is gebaseerd. |

## Iets aanpassen

- **Teksten, vragen, links naar lesdecks en kenniskaarten:** staan bovenin het script in `index.html` (zoek op `LESDECK_URL`, `KAART_URL`, `KQ1`).
- **Prototype aangepast?** Sla de nieuwe prototype-HTML op als `tools/prototype.html` en draai:
  `python3 tools/bouw-live.py tools/prototype.html index.html`
  Het script controleert elke aanpassing en stopt met een melding als iets niet meer past.
- **Opslag per student:** `maxOpslagMB` in `config.js` (standaard 12 MB aan beelden).

## Demomodus

Zonder gegevens in `config.js` draait alles in je eigen browser, met een demo-postvak in plaats van echte mails.
Docent: `docent@demo.nl`, wachtwoord `demo1234`.

## Noodplan

Loopt de game vast, dan werken studenten met de noodkaarten (`noodplan.html`) en zetten ze hun werk in hun portfolio. Werkt de game weer, dan zet een docent in het dashboard het **noodplan** aan. Studenten kunnen dan een gemist level inhalen met een kort formulier, waarna het volgende level opengaat. Standaard staat het noodplan uit. Een level dat al is ingehaald, blijft open als het noodplan weer uitgaat.
