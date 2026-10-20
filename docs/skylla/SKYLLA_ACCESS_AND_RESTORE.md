# SKYLLA – åtkomst, körning och återställning

## Nödvändig autentisering

Supabase SQL-anslutningen kan läsa inventarium och HERMES-register, men kan inte hämta privata Storage-bytes eller utfärda signerade objektlänkar. Miljön redovisar inga tillförda Storage-credentials. Projektägaren bekräftade att signerade läskapabiliteter saknas. Ingen serverfil-, SQL-secrets-, Vault-, RLS- eller nyckelinhämtning används för att kringgå det.

En redan behörig operatör behöver utfärda signerad GET för exakt de fem källpaths som finns i [SKYLLA_PLANNED_PILOT.csv](SKYLLA_PLANNED_PILOT.csv), lämpligen 300 sekunders giltighet. Använd inte bildtransformering. Leverera KERBEROS-kapabilitetsfiler privat med läge `0600`, utanför Git/chatt/loggar. Varje fil innehåller `object_path`, förväntad `sha256`, `size_bytes`, faktisk `expires_at` och `signed_url`. En bred service-role-/secret-nyckel behöver inte tillföras Codex. KERBEROS `read_supabase` används för HTTPS-binär GET, exakt projekt/bucket/path, tidsgräns och full filverifiering. Supabases verkliga signerade giltighet måste stämma; klientens tidsfält kan inte förkorta serverns token.

Inga DELETE-rättigheter behövs för aktuell förberedelse. De kan ordnas först efter separat godkännande av en byteverifierad exakt batch, via en snävt avgränsad betrodd operatör. Privata app-WebP behöver också autentiserad kontroll före radering; de ingår aldrig i raderingslistan.

Drive-anslutningen kunde faktiskt skapa de fem nya kopiorna och läsa tillbaka dem. CLI-adaptern kan i en senare miljö använda en privat tillförd kortlivad `SKYLLA_DRIVE_TOKEN` med läs-/kopieringskapabilitet till just Inbox-källorna och avsedda målmappar. Token anges aldrig som kommandoargument. HERMES-tjänstekontots `drive.readonly` har inte ändrats.

## Verktyg

`scripts/skylla_archive.py` använder KERBEROS fullständiga PNG-verifierare utan att ändra dess policy. `archive-drive` gör binär källhämtning, exakt metadatauppslag av innehållsadresserad målfil, opt-in `files.copy`, arkivreadback och bytejämförelse. POST är hårt begränsad till nya Drive-kopior; DELETE, move och filersättning finns inte. Ett atomiskt copy-intent är lås mot dubbla skrivningar. Oklart svar får inte återförsökas utan avstämning. Befintlig exakt arkivfil återläses och återanvänds.

Descriptorfält: `bucket`, `object_path`, `kind`, `target_key`, `expected_sha256`, `expected_size_bytes`, `inbox_file_id`, `target_folder_id`. Bucket måste vara `alea-hermes-source` och mål-ID måste matcha konfigurationens kategori/variant. Okänd kategori spärras. Standardläget skapar inga kopior.

```bash
python scripts/skylla_archive.py archive-drive \
  --descriptor /private/descriptor.json \
  --journal /private/skylla-copy-journal \
  --output /private/drive-readback.new.json
```

Lägg endast till `--enable-copy` i en uttryckligen avsedd arkivkörning. Gör inga nya kopior av de fem redan registrerade ID:na: använd readback/reuse. Den verkliga femfilspiloten utfördes via Drive-connectorn och verifierades med samma `pair_proof`-funktion. Fristående `verify-pair` kan kontrollera två materialiserade bytefiler med descriptor och rå metadata. Output skapas exklusivt; inne i repot tillåts rapporter endast under `docs/skylla/`.

`eligibility` kräver aktuella Supabase-bytes, permanent Drive-readback, identiska hashvärden/längder, klara beroenden och verifierade visningsbilder/pekare. Evidens äldre än tio minuter spärrar förslaget. Separat batchgodkännande krävs fortfarande; funktionen sätter aldrig `safe_to_delete=true`. Sparad evidens måste uppdateras om arbetet återupptas senare. `archive_batch` redovisar ett separat resultat för varje fil; det är inte en raderingsbatch.

## Återställning från Drive

1. Läs manifestet och exakt permanent Drive-ID. Verifiera dess målparent, hela filens bytes, SHA-256, storlek och full PNG-avkodning. Använd en ny isolerad lokal plats; skriv inte över befintliga filer.
2. Kontrollera att det exakta Supabase-objektet faktiskt saknas. Stäm av jobb/ref-status. Skaffa separat godkännande för återställningsuppladdning och en tillfällig identitet för just det objektet.
3. Använd Supabase Storage-API för att skapa exakt ursprunglig bucket/path med `upsert=false`. Ändra inga tabeller, appreferenser eller HERMES-jobb. Kör aldrig HERMES-publiceraren för att återställa originalet; den kan publicera/aktivera visningsbilder som bieffekt.
4. Läs tillbaka Supabase-objektet autentiserat och jämför hela bytesen med Drive-kopian. Dokumentera återställningshändelsen i ett nytt kvitto. Skriv inte över ett redan befintligt objekt med annan identitet.

Fem verkliga Drive-download/readbacks har bevisat åtkomst till deras exakta originalbytes. Syntetiska tester provar återställningsjämförelsen. Ingen verklig återställningsuppladdning eller oberoende NAS-backup har skapats. Projektägarens dokumenterade residualrisk gäller endast denna source-bucket; det är inte en generell avstängning av backupkrav.

Dokumentation för privata signerade läsningar verifierades genom Supabases dokumentationssökning: [Storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals). Direkt changelog-hämtning var nätverksblockerad. Inga SDK-versioner, databaspolicys eller projektinställningar har ändrats.
