# HERMES 2.0 — LÅST MÅLARKITEKTUR OCH DRIFTSKONTRAKT

**Beslutad 2026-10-15.** Status: **Pilot driftsatt, full produktionskedja ännu inte slutverifierad.**
HERMES 1.0 förblir kompatibel och tillgänglig under införandet. Inga befintliga bilder migreras automatiskt.

## Syfte
Administratören lämnar en bild och väljer objekt. HERMES gör kontrollerad lagring, arkivering, konvertering, verifiering och aktivering. Ett API-anrop eller en commit i sig är aldrig ett fullständigt klarbesked.

## Låsta principer
1. Originalbytes är immutabla och identifieras med SHA-256. Original lagras i privat `alea-hermes-source` och arkiveras i Aleas **publika** GitHub-repository enbart för bilder avsedda att vara offentliga. Skicka aldrig privata rollporträtt eller kampanjfiler via denna profil.
2. Optimerat WebP är ett separat immutabelt objekt under `alea-hermes-public`. Dess URL innehåller innehållets SHA-256, så gamla cacher inte kan återanvända fel bild.
3. En publicerad bild är aktiv först när GitHub-original, Supabase Storage (återläst med checksumma), publik leverans-URL och exakt databaspost är verifierade.
4. HERMES skriver **endast** `icon_path` för namngivet mål i `rule_spells` respektive `rule_magic_symbols`. Övriga spelregler, magidata, bildfält, RLS och gamla poster får inte ändras.
5. Admin kräver riktig Supabase-JWT och serverkontrollerad `profiles.is_admin`. Service role och GitHub-token finns endast i Edge-miljön, aldrig i webbkod eller databastabeller.
6. En bruten kedja lämnar tidigare bild aktiv. Återförsök använder samma objekt och kan inte tyst aktivera en ikon om en annan ändring har skett under tiden.
7. Låst ARCANE IVORY gäller: 1:1 RGBA-PNG, minst 640 px och riktig transparens, app-WebP 640×640, max 500 kB, identisk alfakanal efter nedskalning. Den ljusa elfenbensytan innanför ramen förblir synlig. Visuell motivgranskning är ett separat godkännande.

## Driftsatta delar
- `supabase/migrations/20261015170000_hermes_v2_job_queue_and_storage.sql`: `hermes_jobs`, `hermes_job_events`, två immutabla lagringsbuckets, admin-only RLS för jobbinsyn.
- `supabase/functions/hermes-v2/index.ts`: JWT + adminautentisering; validering av PNG och WebP; SHA-256 på käll- och leveransbytes; två Storage-uppladdningar med återläsning; GitHub Git Data API med SHA-1-verifiering och konfliktåterförsök; kontroll av publik URL; CAS-liknande aktivering och databasåterläsning.
- `features/combat/hermes2.js`: adminformulär med webbläsaroptimering och faktisk alfa-jämförelse samt lista på jobb/återförsök.
- `features/combat/spell-art.js` och `features/combat/admin-symbols.js`: stöder gammal och ny ikonsökväg och visar korrekt laddningsstatus.

## Tekniskt protokoll
1. En admin lämnar original-PNG och väljer `kind = spell | symbol`, `key`.
2. Klienten skalar och optimerar separat WebP, kontrollerar alfakanalen pixel för pixel och skickar multipart via Supabase Edge Function.
3. Edge validerar filsignaturer, dimensioner, storlekar, mål-ID, uppmäter SHA-256, laddar upp till Storage och kontrollerar lagrade bytes genom att ladda ned dem igen.
4. GitHub-original skapas på sökvägen `assets/hermes/originals/<kind>/<key>/<source-sha256>.png`. Exakt Git blob SHA-1 jämförs före och efter commit. Vid redan arkiverad identisk fil gör återförsök ingen extra commit.
5. Publicerad WebP hämtas över dess publika URL; faktisk fil checksummeverifieras.
6. Databasfältet `icon_path` ändras enbart om målpostens tidigare värde fortfarande matchar det som lagrades när jobbet startades. Kontrolleras därefter med ny databasläsning.
7. Jobbet får `active` först därefter. Administrationspanelen måste även lyckas ladda `img` för att ange att bilden visas.

### Status
`staged` → `awaiting_archive` (om GitHub-hemligheten saknas), `archived` → `verified` → `active`. Fel blir `failed` och kan återupptas med `POST { "action":"retry","job_id":"..." }`; senast fungerande ikon fortsätter användas.

## Engångskonfiguration för automatisk GitHub-arkivering
I Supabase-projektets **Edge Functions secrets** måste hemligheten `HERMES_GITHUB_TOKEN` innehålla en GitHub-token med **Contents: Read and write** endast för `lindkvistfoto-dot/alea-crusaders`. Skicka aldrig token i chatt, klientkod eller GitHub-commit. Den här konfigurationen gör att adminuppladdningen kan arkivera originalet utan chattens GitHub-verktyg.

**När hemligheten inte finns är beteendet avsiktligt:** filerna lagras och verifieras, men jobbet stannar vid `awaiting_archive`, utan att ändra ikonpekaren. Konfigurationsstatus måste bekräftas med ett riktigt administratörstest, inte antas utifrån driftsättningen.

## Återstående acceptansprov före allmän aktivering
- [ ] Ett riktigt adminuppladdat ARCANE IVORY-original uppnår `active` utan manuella mellansteg.
- [ ] GitHub-commit och binär checksumma verifierade mot originalbytes.
- [ ] Publicerad WebP hämtas med korrekt transparens och URL-SHA; ikon faktiskt synlig i Alea på mobil.
- [ ] Ny version av samma symbol ändrar endast dess ikon och kringgår gammal cache.
- [ ] Felaktigt original och bruten nätanslutning kan inte slå ut föregående fungerande ikon.
- [ ] Samtidiga ändringar och återförsök skapar inte dubbletter eller skriver över någon annans ändring.
- [ ] GitHub-autentiseringsfel ger tydlig `awaiting_archive` eller `failed` och kan återupptas.
- [ ] Driftplan för schemalagda återförsök och återställning är testad; dagens adminpanel tillhandahåller manuellt återuppta.

**Scope för pilot:** enbart offentliga ARCANE IVORY-ikoner i `rule_spells` och `rule_magic_symbols`. Animationer, privata bilder och övrig utrustning omfattas av arkitekturen men kräver egna verifierade HERMES-profiler före anslutning.
