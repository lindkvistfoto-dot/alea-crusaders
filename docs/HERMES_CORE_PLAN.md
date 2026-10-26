# HERMES CORE — implementeringsplan

**Status:** plan och avgränsat pilotmål; ingen kod, databas, lagring, behörighet eller produktionsinställning har ändrats.

## Mål

Förenkla bilduppladdning, byte och bortkoppling från ChatGPT, Work och Codex till Troférummet. HERMES ALEA och HERMES CORE använder samma bildmål och aktiva bildreferenser, men har separata tekniska vägar.

## Lärdom från HERMES 4

HERMES 4 är inte bevisad som en tillförlitlig helkedja. En dokumenterad grupp på 24 bilder resulterade i att 6 blev aktiva i Supabase; 18 källor hade kapats när stora bilder passerade genom en begränsad text-/Base64-överföring. En annan körning stoppade före Supabase-publicering på grund av en felaktig hash. Det visar att överlämning och källintegritet måste fungera innan en bild kan räknas som klar.

HERMES CORE är en egen pluginväg och egen jobbhantering. Den ska inte vara ett nytt namn för HERMES 4 eller skicka bilder genom HERMES 4:s kö och workflow. CORE får återanvända enskilda, granskade och beprövade bildberednings- och lagringskomponenter. Originalbilden överförs som fil/binärdata; stora bildbytes skickas aldrig genom textutdata eller Base64 i en payload.

## Gemensamt bildkontrakt

- ALEA och CORE pekar på samma utmärkelser, reliefvarianter och aktiva bildplatser. Ingen separat CORE-katalog.
- Material: **Emalj**, **Metallrelief**, **Snidat trä** och **Övrigt**, mappat till befintliga mål.
- **Ladda upp:** originalet hamnar i Drive-inkorg och originalarkiv. Optimerad WebP publiceras till befintlig Supabase-lagring. Bildkopplingen blir aktiv först när publiceringen är verifierad.
- **Byt ut:** publicera den nya WebP-filen före pekarbytet. Om publiceringen misslyckas behålls den gamla bilden.
- **Ta bort:** koppla bort vald bildplats och registrera borttagningen. Radera inte Drive-original eller Supabase-fil.
- Fysisk rensning och gallring ingår inte.

## Badges — första CORE-pilot

De tre sparade lejonramarna är gemensamma nivåramar för Badges, inte bilder som ska kopplas till en enskild badge:

| Nivå | Bild | Systemnyckel |
|---|---|---|
| Guld | `arcane_lion_guld_bla.png` | `arcane-lion-badge-gold` |
| Silver | `arcane_lion_silver_rod.png` | `arcane-lion-badge-silver` |
| Brons | `arcane_lion_brons_gron.png` | `arcane-lion-badge-bronze` |

CORE-piloten ska publicera dessa tre systembilder och verifiera att Badges i Troférummet använder rätt ram efter nivå. Bilden ska inte skrivas till `honor_definitions.image_asset_id`; nivåramarna är gemensamma badge-resurser. Ändra inte befintliga utmärkelser, medaljer eller deras bildpekare som del av uppladdningen.

## HERMES ALEA och HERMES CORE

- ALEA:s webbflöde, jobb och behörigheter lämnas orörda.
- CORE får en egen pluginingång, CORE-jobbhantering och publiceringsväg. Den använder befintliga lagringsmål och bildpekare.
- Flödena använder separata tekniska jobb men måste uppdatera samma bildpekare säkert. Ett byte får inte skriva över ett nyare byte från ALEA eller CORE.
- Ingen ny databas, bucket, generell bildmotor, WASM-komponent eller betald Supabase-branch.

## Minsta CORE-flöde

1. Pluginen tar emot en bildfil och ett uttryckligt Troférumsmål.
2. Bildfilen skickas som fil/binärdata till befintlig Drive-inkorg. Originalet arkiveras och dess åtkomst verifieras innan publicering.
3. CORE skapar en egen jobbpost med mål och Drive-filreferens — aldrig bildbytes i JSON/Base64.
4. CORE hämtar filen direkt från Drive och använder utvalda befintliga komponenter för bildberedning och Supabase-publicering.
5. CORE verifierar att WebP-filen finns i Supabase. Först därefter kopplas bilden till det angivna målet. Ett fel lämnar tidigare aktiv bildkoppling kvar.

En fil ska kunna följas till ett tydligt resultat. Ett fel på en fil ska inte felrapporteras som lyckad publicering eller tyst blockera andra separata jobb.

## Pilot och successivt övertagande

1. Granska befintlig kod och välj endast komponenter vars funktion är verifierad separat. HERMES 4:s befintliga workflow, kö och helkedja återanvänds inte som CORE.
2. Bygg den tunna CORE-pluginvägen och egen, enkel jobbhantering med befintlig teknik.
3. Kör pilot med guld-, silver- och bronsramarna för Badges i Troférummet. Kontrollera att rätt tre Supabase-resurser finns och att ramarna visas för respektive nivå.
4. Efter godkänd pilot: använd CORE för nästa verkliga bildåtgärd. Utöka till en bildtyp i taget; låt ALEA fortsätta hantera webbuppladdningar.
5. Ändra inte gamla bildpekare eller befintliga bilder i bulk. Flytta inte produktionshantering till CORE innan den berörda typen har fungerat från ChatGPT, Work och Codex och fortfarande visas korrekt i ALEA.

## Utanför omfattningen

Ingen automatisk inkorgsstädning, fysisk radering, massmigrering eller orelaterad ändring av HERMES 4. Städning/rensning kan planeras separat senare.
