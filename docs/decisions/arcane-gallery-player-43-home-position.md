# ALEA CRUSADERS – BESLUT: ARCANE GALLERY 4:3 HOME POSITION

**Status: LÅST / GODKÄNT**
**Beslutsdatum:** 2026-10-17
**Omfattning:** Endast spelarens Arcane Gallery.
**Projekt:** Operation TOP GUN – särskilt ICEMAN, GOOSE, PHOENIX, ROOSTER, MAVERICK och SLIDER.

## Beslut

1. Den centrala **bildöppningen** startar alltid med proportionerna **4:3** när spelarens bildvisare öppnas. Det avser den aktiva bildytan innanför bronsramen, **inte** totalformatet för hela artefakten inklusive ornament, kugghjul och separat karusell.
2. Den tvådelade ceremoniella luckan utformas och produceras för en **enda fast 4:3-geometri**. Vänster och höger luckhalva med Alea Crusaders-sigillet i mitten behöver aldrig skalas vertikalt för 16:9, 1:1 eller 9:16.
3. **Öppningssekvens:** bildvisaren visas stängd i 4:3 → sigillet aktiveras och låses upp → luckhalvorna separeras med mekaniska rörelser → halvorna skjuts undan och försvinner bakom ramens sidostycken → ramen får därefter mjukt anpassa bildöppningens höjd till den delade bildens verkliga proportioner. Öppningsluckans geometri ändras inte under själva öppnandet.
4. Före den ceremoniella öppningen ska media och dess dimensioner om möjligt laddas/förberedas. Under öppningens 4:3-fas måste bilden visas med bevarade proportioner (t.ex. `object-fit: contain`), aldrig förvrängas. Ramens efterföljande höjdändring ska vara mjuk och utan oväntat sidledes layoutskifte.
5. **Bildbyte medan visaren är öppen:** ingen ny full lucköppning. Ramen morfar mjukt mellan **16:9, 4:3, 1:1, 9:16** eller andra stödda proportioner, och bilden fortsätter vara proportionellt korrekt.
6. **Stängning:** vid en normal, synlig stängningsanimation återgår bildöppningen först till 4:3; därefter möts luckhalvorna och sigillet låser. Vid utloggning, kampanjbyte och säkerhetsrensning har omedelbar privat datarensning företräde framför ceremonin.
7. Den **separata mekaniska karusellen placeras under bildramen**, aldrig i eller ovanpå den centrala 4:3-bildöppningen. Karusellen har en egen **SLIDER-lucka som glider från höger** och täcker alla lediga *synliga* miniatyrplatser; den försvinner igen när platser fylls. Inga permanent tomma svarta slots.
8. Huvudluckan, mittsigillet och karuselluckan ska levereras som **separata animerbara grafiktillgångar** via HERMES, med transparent bakgrund där det behövs. Återanvänd befintliga, godkända ram-/kolv-/kugghjulsbilder, och förvräng inte graverad ornamentik.
9. Upplevelsen ska fungera på mobil och desktop. `prefers-reduced-motion` ska kunna hoppa över animationer utan att blockera åtkomst till bilden.
10. Ändringar ska **endast gälla spelarvisningen** i denna etapp. Spelledarens visuella gränssnitt, bildkö och knappar för förhandsvisning/publicering utformas senare. Spelarvisningen fortsätter att använda befintligt autentiserat, kampanjbundet flöde för bilder som SL faktiskt har delat.

## Tillståndsmodell (målspecifikation, inte implementerad här)

`CLOSED_4_3` → `UNLOCKING_4_3` → `RETRACTING_SHUTTERS_4_3` → `OPEN_4_3` → `MORPHING_TO_MEDIA` → `OPEN_MEDIA`.

Normalt stängningsflöde: `OPEN_MEDIA` → `MORPHING_TO_4_3` → `CLOSING_SHUTTERS` → `CLOSED_4_3`.

Bildbyte i öppet läge: `OPEN_MEDIA` → `MORPHING_TO_MEDIA` → `OPEN_MEDIA`, utan ny full ceremoniell öppning. Upprepade snabba användaråtgärder ska inte skapa dubbla animationer eller föråldrat bildinnehåll.

## Grafisk konsekvens

**GOOSE** behöver endast **ett par fasta 4:3-luckhalvor** och ett centralt, separat Alea Crusaders-sigill. Ingen vertikalt teleskopisk huvudlucka ska beställas. **PHOENIX** implementerar öppningssekvensen i fast 4:3-läge. **ICEMAN/ROOSTER** ansvarar för att den existerande ramen därefter ändrar höjd efter media. **MAVERICK/SLIDER** bygger en oberoende nedre karusell med högerstyrd lucka.

## Acceptanskriterier

- Stängd bildvisare och öppningsluckans hela rörelse använder exakt samma 4:3-bildöppning.
- Sigill och luckornament förblir odistorderade; luckhalvorna försvinner visuellt bakom sidolisterna.
- Bilden är aldrig utdragen eller beskuren på ett överraskande sätt vid upplåsning/ram-morfning.
- Öppen ram anpassar sig till bildens verkliga format utan ny full öppningsceremoni vid bläddring.
- Synlig stängning återgår till 4:3 innan sigillet låser; säkerhetsrelaterad rensning är omedelbar.
- Separat karusell med automatisk högerlucka täcker alla synliga tomplatser.
- Komponenterna fungerar på mobil, med reducerad rörelse och med bibehållen integritet för privata kampanjbilder.

**Förändringskontroll:** Detta är ett låst designbeslut. SISYPHUS och HERMES ska utgå från det tills användaren uttryckligen beslutar om en ny version. Dokumentet är en specifikation – det påstår inte att luckor eller ny karusell redan är implementerade.
