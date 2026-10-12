# Alea Crusaders — LÅST designstandard för navigeringsknappar

Status: **LÅST (2026-10-11)**. Hem-ikonparet är implementerat som klickbar länk i desktopbannerns vänstra kolumn från v0.35.111. Övriga navigeringsikoner följer fortfarande designstandarden inför kommande implementering.

## Förlaga
De två godkända Hem-ikonerna i ChatGPT-konversationen den 11 oktober 2026 är **stilförlaga**:
- Normal/ej vald: vertikalt svärd med hjaltet uppåt, omgivet av symmetrisk lagerkrans på mörk metall-/stenplatta.
- Vald/aktiv: **samma** svärd, lagerkrans, proportioner, konturer, vinkel och ram, men med markant starkare gyllene glöd.

Skapa inte alternativa former eller lägg till kompassros. Hem-symbolen är Aleas emblem med svärd + lagerkrans, inte en husikon.

## Gemensamt för alla navigeringsikoner
- **Två PNG-filer per ikon:** normal och vald. Transparent bakgrund **utanför** knappens kontur och eventuell mjuk glöd.
- **Kvadratiskt 1:1-format**, samma bildyta, centrering, marginaler och dimensioner för båda tillstånden. Passar nedskalning i den kompakta topplisten.
- **Knappform:** rundad kvadrat med diskret fasad ram; premium high-fantasy-känsla med realistiska, hantverksmässiga detaljer, lätta repor/patina, skarpa silhuetter.
- **Färgskala:** mörkt kol/brun/svart, antik brons, mässing och guld. Samstämmig med Alea Crusaders-banner och appens befintliga designspråk.
- **Ej vald:** mörk **semitransparent** inre bakgrund, nedtonade bronshöjdpunkter, mycket återhållen ljuseffekt. Symbolen ska synas tydligt i liten storlek.
- **Vald:** samma grafik och form; förgylld kant, varmare/ljusare metall och tydligt gyllene sken omkring symbolen/ramen, utan att konturerna försvinner.
- **Ingen inbakad text** i bildfilerna. Tillgängligt namn/etikett och knappfunktion ligger i HTML, oberoende av bilderna.
- Undvik detaljförändringar mellan tillstånden: skillnaden ska vara **ljus, färg och glöd**, inte motiv eller position.
- Symbolerna för övriga destinationer anpassas till samma rundade platta, material, ram, ljussättning och skala. Hem-paret är kalibreringsreferens.

## Implementation och fortsatt utbyggnad
- Behåll befintliga navigationselement, klickfunktioner och aria-etiketter.
- Bilderna ska vara separata från tidsdygnsbannern, så både bildbakgrund och navigeringsikoner kan ersättas oberoende av varandra.
- Föreslagen konsekvent namngivning: `assets/navigation/<id>-normal.png` och `assets/navigation/<id>-active.png`.
- När ikonerna är slutgodkända går det att ansluta dem som CSS-/bildlager. Ändra **inte** mobilnavigeringen förrän den separat godkänns.


## Installerat v0.35.113
- Sex nya ikonmotiv i ordning: **Targans Gille** (våg + börs), **Värdshuset** (ölkrus), **Akademin** (bok), **Material** (bildramar), **Rollfigurer** (porträtt), **Strid** (korsade svärd).
- De åtta levererade motivbilderna för Akademin, Material, Rollfigurer och Strid används parvis som mörkt/lyst läge. Gille och Värdshuset levererades enbart som lysande bilder och fick varsamt nedtonade normalvarianter.
- För den kompakta toppmenyn används två **optimerade AVIF-sprites med 6 × 48 px** under `assets/navigation/alea-nav-normal.avif` och `assets/navigation/alea-nav-active.avif`. Bildformatet är en implementation för små, snabba knappar; standarden för framtida original/PNG-export kvarstår.
- Rollfigurers befintliga navigeringsknapp flyttas visuellt till ikonraden, men behåller sitt id och sin funktion. Materialknappen kan skapas senare i sidladdningen och får ändå rätt bild.
- Aktuell sida får lysande bild automatiskt. På mobil behålls navhubben och mörka/lysande småbilder används även för Gille, Värdshus och Akademin inne i menyn.

## Kartor / Platser (2026-10-12)
- `mapNavBtn` använder nu levererat ikonpar: `map-normal.avif` (mörk) och `map-active.avif` (gyllene sken), 512×512 med transparens.
- Oförändrad `openMap()`-navigering och samma `aria-current="page"`-regel samt 104px-storlek som andra knappar.

## Tärning, Administration och Kampanjjournal (v0.35.141)
- Navigeringens befintliga `diceNavBtn`, `adminNavBtn` och dynamiska `journalNavBtn` använder separata originalbaserade transparenta 512×512 AVIF-bildpar, med mörk brons och aktivt gyllene sken.
- Ingen ny knapprutt: tärningen använder `openDice()`, administration `openAdmin()`, och journalen samma `jOpen`-lyssnare. `aria-current="page"` växlar bild som övriga navigeringsikoner.
- Admin-knappen behåller `hidden`-behörighetsstyrning; mobilens journalistikon i äventyrshubben får samma brons/guldmotiv utan extra rad i mobilhuvudet.
