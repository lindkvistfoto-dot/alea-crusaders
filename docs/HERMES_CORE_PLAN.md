# HERMES CORE — implementeringsplan

**Status:** endast plan; ingen kod, databas, lagring, behörighet eller produktionsinställning har ändrats.

## Mål

Samma tre bildåtgärder ska kunna användas från ChatGPT, Work och Codex:

- Ladda upp en ny bild
- Byt ut en bild
- Ta bort en bildkoppling

Originalet behålls i Google Drives originalarkiv vid borttag. Fysisk rensning och gallring är senare arbete.

## Gräns mot HERMES ALEA

- HERMES ALEA fortsätter hantera bildåtgärder som startar i Aleas webbmiljö.
- HERMES CORE hanterar bildåtgärder som startar i ChatGPT, Work eller Codex.
- CORE ändrar inte Aleas uppladdningsvy, Edge-funktion, WASM-verifiering, migreringar eller befintliga workers.
- Båda ingångarna ska uppdatera medalj eller relief genom samma hanterade målkontrakt. CORE får inte bli en andra, oberoende skrivare till Troférummets bildfält.
- Befintliga HERMES 4-flöden och andra bildkategorier lämnas orörda. Endast nödvändig befintlig bildberedning och publicering återanvänds.

## Föreslaget flöde

1. Pluginåtgärden tar emot den bifogade bilden och valt Troférumsmål.
2. Originalet läggs i befintlig Drive-inkorg och i originalarkivet.
3. Ett separat HERMES CORE-jobb skapar visnings-WebP och publicerar den till godkänd Supabase-lagring.
4. När publiceringen är klar kopplar en måländring bilden till vald medalj eller relief.
5. Kopian i inkorgen lämnas tills en separat rensningsfunktion byggs. Ingen städworker ingår i V1.

## Åtgärder

- **Ladda upp:** publicera bilden och koppla den sedan till valt mål.
- **Byt ut:** publicera den nya bilden först och byt sedan kopplingen. Vid publiceringsfel ligger den gamla bilden kvar som aktiv.
- **Ta bort:** töm bildkopplingen och registrera `BORTTAGEN`. Behåll originalet i Drive-arkivet och publicerade filen. Ingen fysisk radering ingår i V1.

## Omfattning och nödvändiga grundskydd

Piloten omfattar endast Troférummets medaljer/utmärkelser och reliefvarianter som redan representeras i HERMES ALEA. Använd de fyra beslutade materialtyperna: **Emalj**, **Metallrelief**, **Snidat trä** och **Övrigt**. Varje utmärkelse kan ha flera bilder, men bara en vald aktiv bild.

Återanvänd befintliga målbehörigheter och versionshanterade uppdatering. Workern skriver endast valt bildfält. Filhanteringen begränsas till att läsa bilden, skapa WebP och publicera den till valt mål. CORE får ingen webbläsarbaserad konvertering eller WASM-beroende.

Ingen generell tillgångsdatabas, automatisk gallring, arkivradering, orphan-rensning, bred valideringsram eller orelaterad HERMES-ändring ingår.

## Pilot och införande

1. Bekräfta exakt målkonvertering och den gemensamma måländringen mot aktuell HERMES ALEA-implementation.
2. Implementera pluginadaptern och workern på en separat branch. Lämna befintliga Alea- och HERMES 4-ingångar orörda.
3. Prova uppladdning, utbyte och borttag med en syntetisk testutmärkelse i Troférummet. Kontrollera att misslyckat utbyte lämnar den gamla bilden aktiv och att borttag behåller Drive-originalet.
4. Granska pull request och CI. Aktivera endast den avgränsade piloten när Drive-åtkomst och Supabase-publicering fungerar med de faktiska anslutna behörigheterna.
5. Utöka först efter godkänd Troférumspilot.

## Implementationsgräns

Nuvarande HERMES ALEA äger Troférummets målposter och skyddar deras uppdateringar. Befintlig HERMES 4-publicerare har inte ett färdigt kontrakt för medalj/relief: skapa, byt ut och ta bort. Första kodändringen måste därför vara en smal CORE-adapter som använder samma hanterade målkontrakt. Den får inte skriva målens bildfält direkt eller gå runt HERMES ALEA. Om kontraktet inte går att anropa utan en andra skrivare eller ändring av webb-/WASM-vägen ska arbetet stanna före kodning tills gränssnittet är löst.