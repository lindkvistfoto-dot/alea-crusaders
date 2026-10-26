# HERMES CORE — implementeringsplan

**Status:** endast plan; ingen kod, databas, lagring, behörighet eller produktionsinställning har ändrats.

## Mål

Förenkla bilduppladdning, byte och bortkoppling från ChatGPT, Work och Codex till Troférummet. HERMES ALEA och HERMES CORE använder samma bildmål och aktiva bildreferenser, men har separata tekniska vägar.

## Lärdom från HERMES 4

HERMES 4 är inte bevisad som en tillförlitlig helkedja. En dokumenterad grupp på 24 bilder resulterade i att 6 blev aktiva i Supabase; 18 källor hade kapats när stora bilder passerade genom en begränsad text-/Base64-överföring. En annan körning stoppade före Supabase-publicering på grund av en felaktig hash. Det visar att överlämning och källintegritet måste fungera innan en bild kan räknas som klar.

CORE ska därför återanvända HERMES 4-delar som fungerar var för sig — befintlig Drive-intagning, bildberedning och Supabase-publicering — men inte anta att den nuvarande HERMES 4-kedjan fungerar från kanal till aktiv bild. Originalbilden ska överföras som fil/binärdata till Drive; stora bildbytes ska aldrig skickas genom textutdata eller Base64 i en köpayload.

## Gemensamt bildkontrakt

- ALEA och CORE pekar på samma utmärkelser, reliefvarianter och aktiva bildplatser. Ingen separat CORE-katalog.
- Material: **Emalj**, **Metallrelief**, **Snidat trä** och **Övrigt**, mappat till befintliga mål.
- **Ladda upp:** originalet hamnar i Drive-inkorg och originalarkiv. Optimerad WebP publiceras till befintlig Supabase-lagring. Bildkopplingen blir aktiv först när publiceringen är verifierad.
- **Byt ut:** publicera den nya WebP-filen före pekarbytet. Om publiceringen misslyckas behålls den gamla bilden.
- **Ta bort:** koppla bort vald bildplats och registrera borttagningen. Radera inte Drive-original eller Supabase-fil.
- Fysisk rensning och gallring ingår inte.

## HERMES ALEA och HERMES CORE

- ALEA:s webbflöde, jobb och behörigheter lämnas orörda.
- CORE får egen pluginingång och använder befintliga lagringsmål och bildpekare.
- Flödena använder separata tekniska jobb men måste uppdatera samma bildpekare säkert. Ett byte får inte skriva över ett nyare byte från ALEA eller CORE.
- Ingen ny databas, bucket, generell bildmotor, WASM-komponent eller betald Supabase-branch.

## Minsta CORE-flöde

1. Pluginen tar emot en bildfil och ett uttryckligt Troférumsmål.
2. Bildfilen skickas som fil/binärdata till befintlig Drive-inkorg. Originalet arkiveras och dess åtkomst verifieras innan publicering.
3. Ett jobb skickar metadata och Drive-filreferens — aldrig bildbytes i JSON/Base64 — till befintlig HERMES-intagning.
4. HERMES hämtar filen direkt från Drive, använder befintlig bildberedning och publicerare, och verifierar att WebP-filen finns i Supabase.
5. Först efter lyckad verifiering kopplas WebP till det angivna målet. Ett fel lämnar den tidigare aktiva bildkopplingen kvar.

En fil ska kunna följas till ett tydligt resultat. Ett fel på en fil ska inte felrapporteras som lyckad publicering eller tyst blockera andra separata jobb.

## Pilot och successivt övertagande

1. Granska befintlig HERMES 4-kod och välj endast de delar som hanterar binär Drive-inläsning, bildberedning och Supabase-publicering utan texttransport av bildbytes.
2. Bygg en tunn CORE-pluginadapter och den minsta målanslutning som krävs för Troférummets befintliga bildpekare.
3. Kör CREATE, REPLACE och REMOVE på en isolerad testutmärkelse i Troférummet. Kontrollera att aktiv pekare och visad bild stämmer efter varje operation, att gammal bild finns kvar efter misslyckat byte och att originalet finns kvar efter bortkoppling.
4. Efter godkänd pilot: använd CORE för nästa verkliga åtgärd av samma bildtyp. Utöka till en bildtyp i taget; låt ALEA fortsätta hantera webbuppladdningar.
5. Ändra inte gamla bildpekare eller befintliga bilder i bulk. Flytta inte produktionshantering till CORE innan den berörda typen har fungerat från ChatGPT, Work och Codex och fortfarande visas korrekt i ALEA.

## Utanför omfattningen

Ingen automatisk inkorgsstädning, fysisk radering, massmigrering, ny bildpipeline eller orelaterad ändring av HERMES 4. Städning/rensning kan planeras separat senare.
