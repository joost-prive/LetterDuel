# LetterDuel

Een Nederlands woordspel voor in de browser. Je vult je eigen bord van 5×5 met
letters en probeert meer woorden te vormen dan je tegenstander — horizontaal en
verticaal.

**Live: [letterduel.net](https://letterduel.net)**

## Het spel

Beide spelers beginnen met hetzelfde bord: drie startletters op dezelfde
plekken. Daarna gaat het om en om:

1. Jij kiest een letter en legt hem neer. **Je tegenstander krijgt dezelfde
   letter** en mag zelf bepalen waar die komt.
2. Je tegenstander kiest een letter en legt hem neer. Jij krijgt diezelfde
   letter en bepaalt zelf waar.

Daar zit de hele spanning: een letter die jou goed uitkomt, geef je gratis weg.
Na 25 vakjes telt elke rij en elke kolom mee — 5 punten voor een woord van drie
letters, 10 voor vier, 15 voor vijf. Maximaal 150.

### Modi

| Modus | Wat het is |
| --- | --- |
| **Daily** | Elke dag dezelfde puzzel voor iedereen, één poging, met dagranglijst en deelbare uitslag |
| **Tegen computer** | Vrij spelen op easy, medium of hard |
| **Online duel** | Tegen een vriend via een uitnodigingslink, realtime |

Alle modi hebben een schaakklok die alleen loopt als jij aan zet bent.

## Techniek

Bewust klein gehouden: geen build-stap, geen framework, geen bundler.

- **`index.html`** — de hele app: opmaak, schermen en spelverloop
- **`gameLogic.js`** — alle spellogica los van het scherm: scores, potentie,
  dagelijkse puzzels en de computertegenstander. Werkt in de browser én onder
  Node, zodat het testbaar is.
- **`words.js`** — 9.321 Nederlandse woorden van 3, 4 en 5 letters
- **`functions/`** — Cloudflare Pages Functions die per gedeeld daily-resultaat
  een previewpagina en -afbeelding genereren
- **Firebase** — Firestore voor ranglijsten en online duels, anonieme login

### De computertegenstander

De drie niveaus verschillen op vier punten, niet alleen op hoe vaak de computer
een fout maakt:

| | plaatsing | kijkt vooruit | kiest letter slim | houdt rekening met jou |
| --- | --- | --- | --- | --- |
| **easy** | redelijk | nee | nee | nee |
| **medium** | goed | ja | ja | nee |
| **hard** | optimaal | ja | ja | **ja** |

Die laatste kolom is het verschil dat telt. Alleen `hard` weegt mee dat jij
dezelfde letter cadeau krijgt, en kiest dus liever een letter waar jij weinig
mee kunt.

Gemeten over 60 partijen per match haalt easy gemiddeld 53 punten, medium 91 en
hard 109. Hard wint 88% van zijn partijen tegen medium, medium 98% tegen easy.
De parameters staan in `AI_PROFILES` in `gameLogic.js` en zijn met simulaties
afgesteld, niet op gevoel.

De daily gebruikt altijd `hard`, zodat iedereen tegen dezelfde tegenstander
speelt.

## Ontwikkelen

```bash
npm install
npm test
```

Er is geen dev-server nodig; elke statische server volstaat:

```bash
python -m http.server 8000
```

Op `localhost` staat de debugknop aan (vult het bord door tot de eindfase).
Om de dagelijkse limiet tijdelijk te omzeilen tijdens het testen:

```js
localStorage.setItem('ld_dev_unlock', '1')
```

Resultaten uit die modus worden bewust niet opgeslagen, zodat de dagranglijst
schoon blijft.

## Deployen

Cloudflare Pages is gekoppeld aan de `main`-branch: elke push gaat direct live.
Er is geen build-commando en geen output-map — de repo wordt as-is geserveerd.

## Nog te doen

- `www.letterduel.net` bestaat niet; CNAME `www` → apex toevoegen in Cloudflare
  DNS en als custom domain in Pages.
- Cloudflare Web Analytics aanzetten. Haal de snippet op via Cloudflare →
  Analytics & Logs → Web Analytics → Add a site, en plak die onderaan de
  `<body>` in `index.html`.
- TTL-policy op het veld `expiresAt` van de collectie `games` aanzetten in de
  Firestore-console, zodat verlaten duels vanzelf opgeruimd worden.
- De previewafbeelding van gedeelde daily-resultaten is een SVG
  (`functions/share/daily/[date]/[uid]/image.svg.js`). Facebook, WhatsApp en X
  ondersteunen geen SVG als `og:image`, dus die previews tonen waarschijnlijk
  geen plaatje.

## Licentie

Privéproject van Joost van de Ven. Geen licentie toegekend.
