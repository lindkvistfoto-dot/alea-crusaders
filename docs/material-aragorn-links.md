# Aragorn – Konungens återkomst (v0.34.83)

## Leverans

**Administration → Bildbibliotek** innehåller nu kopplingar till platser, SLP, monster och stridsscener.
Välj ett material, välj typ, sök fram ett namn och klicka **Koppla bild**. Befintliga kopplingar visas med namn; **Koppla bort** avlägsnar endast länkraden och aldrig filen.

I bibliotekets rubrik finns **Hämta äldre bilder** som anropar `aragorn_sync_legacy_materials`. Synken registrerar gamla bildreferenser via bucket/sökväg, återanvänder befintliga metadata och skapar saknade länkar; den laddar inte upp eller duplicerar filer. Upprepade körningar är idempotenta. Registreringen innefattar befintliga SLP- och monsterporträtt, platsbilder, stridskartor och kampanjkartor. Kampanjkartor ligger i biblioteket som kartmaterial men är inte en egen länktyp (den nuvarande länkmodellen innehåller plats, SLP, monster, händelse och stridsscen).

## Säkerhet

- Material och målobjekt filtreras efter **aktuell kampanj**. Serverns RLS och databasens valideringstrigger hindrar kopplingar till annan kampanj.
- Inga externa publika bildlänkar; återanvända filer ligger kvar i sina ursprungliga privata Storage-buckets.
- Storage-regeln för redan registrerade original ger en spelare läsning **endast för exakt matchande filreferens** och bara vid aktiv presentation eller aktiv share. Befintliga Storage-policies kvarstår oförändrade.
- SL-anteckningar följer Bilbos separata skyddade tabell. Metadata och filbytes raderas aldrig vid koppla bort.
- Sökning efter objekt begränsas till maximalt 100 träffar åt gången. Växla typ eller skriv ett mer specifikt namn vid större kampanjer.
- När man lämnar materialets detaljvy ignoreras fördröjda resultat från tidigare sökningar och kopplingar.

## Implementerade delar

- `features/material/links.js` – isolerad logik för kopplingar, namnsökning, bortkoppling och synkronisering.
- `features/material/library.js` – Aragorns panel monterad i Bilbos detaljvy och synkknapp i verktygsraden.
- `src/styles/app.css` – responsiv och kontrastrik presentation.
- `supabase/migrations/20261008_aragorn_legacy_material_links.sql` – serverfunktion och strikt Storage-policy.
- `tests/material-aragorn-links.test.js` – regressionstester för kampanjisolering, återanvändning, namnvisning, synk och städning av asynkrona svar.
- Versionshöjning i `package.json`, `package-lock.json`, `index.html` och modulingången i `src/main.js`.

## Kampanjen Skelettbyns Hemlighet

Vid första synken registrerades **7** redan existerande bilder och **4** objektkopplingar: tre kampanjkartor, två stridskartor, ett SLP-porträtt och ett monsterporträtt. En upprepad synkning skapade varken nya poster eller länkar.

## Avgränsning

**Visa nu**, spelarmapp och realtidsuppdateringar görs i Frodo, Sam och Galadriel. Aragorn skapar återanvändbara materiallänkar men publicerar inget material för spelarna av sig självt. Slutlig verklig browser- och rolltest utförs i Elronds prov.
