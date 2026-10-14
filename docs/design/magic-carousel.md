# LÅST DESIGN – Magikarusell och besvärjelseflöde i Alea Crusaders

**Status:** LÅST – designbeslut, ännu inte implementerat
**Datum:** 2026-10-14
**Omfattning:** Stridsvyns val, förberedelse, kast och avbrott av besvärjelser i Drakar och Demoner Expert.
**Princip:** Karusellen väljer; mittenramen visar; bekräftelseknappen utför handlingen.

## 1. Visuell utformning – magikarusellen

- En låg, smal, horisontell **magibanner/karusell** i magipanelens överkant, direkt ovanför de tre befintliga guldramarna. Den får inte skapa onödig höjd i mobilens stridsvy.
- 3–4 besvärjelseikoner synliga på mobil, fler på större skärmar. Riktiga besvärjelseikoner från Aleas masterregister; ingen texttung dropdown som standard.
- **Äkta oändlig Pac-Man-karusell:** svep vänster/höger kontinuerligt, efter sista ikonen kommer första och vice versa. Ingen synlig start/slut-kant. Mus/pekare och tangentbords-/knappalternativ behöver fungera.
- Designen använder befintlig mörk fantasyestetik och diskreta guldramar. Valt objekt framhävs tydligt. Svep ska ha mjuk tröghet och landa stabilt; undvik rörelser som stör precisionen.
- I normal spelvy visas endast rollpersonens **inlärda/tillgängliga besvärjelser i minnet**. Den fysiska besvärjelseboken är en separat Expert-regelmekanik, inte namnet eller funktionen på denna väljare.
- Testmiljön med alla besvärjelser ska fortsatt ha sökbar lista/dropdown som reservväg, inte som dominerande normal-UI.

## 2. Normalfas A – öppna Magi och välja besvärjelse

1. Spelaren väljer **Magi** i Runda.
2. Om ingen besvärjelse är förberedd visas magikarusellen omedelbart, ovanför de tre guldramarna.
3. Innan ett aktivt val kan mittenramen visa neutral magisk dimma/platshållare; valkravet ska framgå tydligt, utan extra informationsrader under ramarna.
4. När spelaren trycker på en ikon **förhandsväljs** den besvärjelsen och dess bild/cutout, namn och relevanta EG-visning uppdateras direkt i **mittenramen**. Karusellen är fortsatt synlig och kan användas för att ändra valet.
5. Detta val förbrukar ingen handling och är **inte** samma sak som att förbereda.
6. Knappen under ramarna är **Förbered besvärjelse** för vanliga icke-kvicka besvärjelser (eller en motsvarande omedelbar kastväg för kvicka enligt Expert).
7. Tre guldramar behålls: magiker till vänster, den valda besvärjelsen i mitten, mål/förberedelse till höger. Den redan överenskomna visuella ramen och besvärjelse-coutouten behålls.

## 3. Normalfas B – förberedelse låser val och döljer karusellen

1. Tryck på **Förbered besvärjelse** startar förberedelsen genom den befintliga handling-/SR-mekaniken och **låser besvärjelsevalet**.
2. **Karusellen försvinner helt när besvärjelsen har förberetts.** Den ska inte ligga kvar som grå, inaktiv rad i nästa steg.
3. Mittenramen fortsätter visa den låsta besvärjelsen. Höger ram visar timglas/förberedelse enligt befintlig design under förberedelsefasen.
4. Vid nästa tillåtna SR med kastläge visas **ingen karusell**; endast tre ramar och kastrelaterade kontroller.
5. Inget mål behöver väljas i förberedelse-SR för vanliga icke-kvicka besvärjelser. Mål väljs i kast-SR.

## 4. Normalfas C – kasta eller avbryt

- I kast-SR visas magiker → låst besvärjelse → valt mål/område, men **ingen karusell**.
- Under de tre ramarna ligger **två tydliga knappar sida vid sida**:
  - Primär: **Kasta besvärjelse / Bekräfta kast**.
  - Sekundär: **Avbryt besvärjelse**.
- **Avbryt** ska fungera även om det inte finns några giltiga mål, räckvidden inte räcker eller kastet annars inte kan genomföras.
- Avbryt rensar det förberedda valet, målval, eventuell tilldelning av EG och kastförberedelsens tillstånd. Nästa gång magikern kan välja en ny handling visas karusellen igen.
- **Avbryt får inte ge en extra handling** eller kringgå Experts krav på förberedelse/SR; en ny vanlig besvärjelse måste förberedas enligt reglerna.
- Samma övergång till återställt val används när förberedelsen bryts av spelreglerna, t.ex. en skada/tillstånd som faktiskt avbryter magin. Utgå från regelmotor och verifierad avbrottsorsak, inte varje skadetillfälle.
- Resultat, historik och faktiskt förbrukad PSY följer reglerna; ett avbrott ska inte i sig framstå som ett genomfört besvärjelseslag.

## 5. Kvicka besvärjelser

- Kvicka besvärjelser väljs i samma karusell men går direkt till relevant kastläge enligt Experts regler, utan obligatorisk extra förberedelse-SR.
- Karusellen döljs efter att spelaren bekräftat den kvicka kastvägen. Befintlig semantik för handling, mål och effektgrad bevaras.

## 6. Automatisk, personlig sortering

- Ordna rollpersonens besvärjelser efter **antal faktiskt genomförda kast** (mest använda först), inte favoritmarkering, valklick eller enbart påbörjad förberedelse.
- Ordningen är personlig för respektive rollperson. Vid lika användning tillämpas stabil sortering (t.ex. svensk bokstavsordning).
- **Frys ordningen under en pågående strid** så att ikonerna inte flyttar på sig mitt under spel. Uppdatera placeringen först inför nästa strid.
- Karusellens loop är oändlig oavsett antal ikoner och ska hantera även färre än fyra tillgängliga besvärjelser utan förvirrande dubletter i valflödet.

## 7. Tillstånd och acceptanskriterier

Föreslagna UI-tillstånd: `choosing` → `preparing` → `ready_to_cast` → `resolved`; `cancelled/interrupted` återgår till `choosing` först vid nästa regelmässigt tillåtna handling. UI-tillstånd ska härledas från/synkroniseras med beständiga stridsdata och inte bli fel vid omladdning, byte av kombattant eller SR.

Godkänt när:
- Magi öppnad utan förberedelse visar loopande karusell och förhandsvald besvärjelse i mittenram.
- Val av en annan ikon uppdaterar mittenramen utan att utföra en handling.
- Förberedelse låser besvärjelsen och tar bort karusellen.
- Kast-SR visar vald besvärjelse och **Kasta** + **Avbryt** sida vid sida, utan karusell eller överflödiga informationsrader.
- Avbryt fungerar även utan giltiga mål och kan inte användas för gratis extrahandling.
- Avbrott via Expert-regler återställer valflödet konsekvent.
- Kvicka besvärjelser följer sitt snabbare flöde.
- Karusellen är användbar med touch/mus och på både mobil och desktop; statistiken flyttar inte ikoner under strid.

## 8. Avgränsning

Det här dokumentet **låser användarupplevelsen och funktionens design**. Det är ingen implementation, ingen ändring av aktuellt kastflöde och inget påstående om färdiga animationer. Implementationen ska göras separat, med test av Expert-regler, synkronisering, avbrott och responsiv layout.
