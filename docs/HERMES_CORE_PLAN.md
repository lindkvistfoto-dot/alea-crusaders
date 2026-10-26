# HERMES CORE — implementeringsplan

**Status:** endast plan; ingen kod, databas, lagring, behörighet eller produktionsinställning har ändrats.

## Mål

Samma enkla bildåtgärder ska finnas från ChatGPT, Work och Codex:

- Ladda upp en bild
- Byt ut en bild
- Ta bort en bildkoppling

HERMES ALEA och HERMES CORE ska samsas om Troférummets bilder. De delar bildlivscykel och mål, men har separata tekniska flöden.

## Gemensamt produktkontrakt

- Samma utmärkelser och reliefvarianter i Troférummet används av båda vägarna.
- Materialtyper: **Emalj**, **Metallrelief**, **Snidat trä** och **Övrigt**. En utmärkelse får ha flera bilder, men bara en aktiv per plats.
- **Ladda upp:** ny bild blir aktiv först när publiceringen lyckats.
- **Byt ut:** publicera den nya bilden först och byt sedan aktiv koppling. Vid fel behålls den gamla aktiva bilden.
- **Ta bort:** töm bildkopplingen och registrera `BORTTAGEN`. Originalet i Drive-arkivet och publicerade filen behålls.
- Fysisk rensning och gallring byggs senare; V1 raderar inga filer.

## Separata tekniska flöden

### HERMES ALEA — webb

Behåll webbflödets befintliga uppladdning och målhantering. HERMES CORE ändrar inte Aleas webbläsarkod, Edge-funktioner, WASM-paket, befintliga jobb eller inställningar.

### HERMES CORE — ChatGPT, Work och Codex

1. Pluginverktygen tar emot bild och valt Troférumsmål.
2. Originalet läggs i befintlig Drive-inkorg och i originalarkivet.
3. CORE-jobbet förbereder visnings-WebP och publicerar den till Supabase.
4. När publiceringen är klar kopplas bilden till samma utmärkelse/materialplats som ALEA visar.
5. Inkorgs- och lagringsrensning ingår inte i V1.

CORE får ha egen inläsning och bearbetning. Det får inte skapa en parallell version av utmärkelser, materialval eller aktiva bildkopplingar. Båda flödena måste respektera samma mål och uppdateringsordning.

## Omfattning och nödvändiga grundskydd

Pilotera endast Troférummets medaljer/utmärkelser och reliefvarianter. Använd befintlig bildprofil och behörighetsmodell för respektive mål. Lägg inte till andra kontroller än sådant som behövs för att hantera filen och skriva till valt mål.

Publicera den nya WebP-filen före ändring av aktiv bildkoppling. En misslyckad uppladdning eller publicering ska lämna nuvarande bild aktiv. CORE:s borttag ska följa gemensam semantik och lämna originalarkivet orört.

Ingen ny generell bildmotor, generell tillgångsdatabas, automatisk gallring, arkivradering, orphan-rensning eller orelaterad ändring av HERMES 4 ingår.

## Pilot och införande

1. Kartlägg exakt hur CORE-bilder ska kopplas till samma utmärkelser/materialplatser som ALEA använder, utan att dubblera målposter.
2. Bygg CORE-intag och worker separat från webbflödet. Återanvänd befintlig bildberedning/publicering där det passar, utan att ändra ALEA:s ingång.
3. Prova ladda upp, byta ut och ta bort med en syntetisk testutmärkelse i Troférummet. Kontrollera aktiv bild efter varje åtgärd och att Drive-originalet finns kvar efter borttag.
4. Granska PR/CI och kör den avgränsade piloten med faktiska Drive- och Supabase-anslutningar.
5. Utöka först efter godkänd Troférumspilot.


## Successiv övergång från OpenAI-kanalerna

HERMES CORE ska bli den normala vägen för nya bildåtgärder från ChatGPT, Work och Codex. Övergången sker per bildtyp och arbetsflöde, efter att den föregående delen har fungerat i Troférummet:

1. **Troférumspilot:** kör CREATE, REPLACE och REMOVE mot ett isolerat testmål. Kontrollera att Alea och Core ser samma aktiva bild och att ett misslyckat byte lämnar föregående bild aktiv.
2. **Kanalbyte:** använd CORE för nästa riktiga uppladdning, byte eller bortkoppling i den pilotade bildtypen. Befintliga bilder och deras länkar lämnas orörda.
3. **Nästa bildtyp:** lägg till en typ i taget med dess befintliga bildprofil och mål. Utöka inte en åtgärd till andra tabeller eller fält.
4. **Övertagande:** när en typ fungerar från alla tre kanalerna och fortfarande visas korrekt i Alea, låt CORE ta nya bildåtgärder för den typen. Alea fortsätter hantera webbens bildåtgärder.

Övergången gäller framtida hantering. Den gör ingen massmigrering och tar inte bort gamla uppladdningsvägar förrän deras användning har inventerats och den berörda typen är verifierad. Städning/rensning och fysisk radering är fortsatt utanför V1.

## Kanalernas arbetsflöde

CORE ska använda den befintliga HERMES 4-kedjan för OpenAI-kanalerna: Drive Inbox → verifierat originalarkiv → befintlig WebP-beredning → befintlig Supabase-publicerare. Inga nya databaser, buckets, Edge-funktioner, WASM-komponenter eller Supabase-brancher införs.

Den enda nya kopplingen som behöver byggas är en tunn HERMES 4-adapter från ett explicit Troférumsmål till samma image_asset_id som HERMES ALEA använder. Den ska återanvända HERMES 4:s kö, jobbspårning, hashverifiering, WebP-publicering och etablerade compare-and-set-mönster. Mål-ID, bildrevision och materialvariant binds till ordern. ALEA:s webbflöde och dess hermes_alea_jobs förblir oförändrade; båda vägarna arbetar mot samma utmärkelse-/reliefposter och aktiva bildpekare.

CORE tar emot kanalens fil och skapar en explicit, idempotent HERMES 4-order först efter att originalet lagts i Inbox och arkivkopian verifierats. En misslyckad beredning/publicering lämnar den tidigare aktiva pekaren orörd. REMOVE kopplar bort den valda bildplatsen utan att radera arkivoriginal eller publicerad fil. Fysisk rensning ingår inte.

## Avgränsning

Två implementationer får finnas, men de ska dela produktens bildsemantik, målposter och aktiva val. CORE ska inte bli en oberoende katalog eller ett separat Troférum. Den exakta bryggan mellan CORE:s publicerade fil och ALEA:s befintliga bildreferens fastställs i implementationen, innan några befintliga referenser ändras.