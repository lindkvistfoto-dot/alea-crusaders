# SKYLLA – åtkomst, körning och återställning

## Nödvändig autentisering

SQL-anslutningen läser inventarium och register. Direkta privata Storage-credentials och tidigare signerade GET-filer saknas fortfarande, men byteåtkomst har nu etablerats via den separata, kortlivade [driftsättningsbundna verifieraren](SKYLLA_SCOPED_ACCESS.md). Fem privata original har faktiskt verifierats mot Drive. Bred servernyckel stannar i Supabase; inga manuella objektlänkar behövs.

Den befintliga anslutningens driftsättningsbehörighet används för en fast allowlist och hash av en lokalt skapad 256-bitars kapabilitet. Själva hemligheten lagras med `0600` utanför Git och gäller högst 30 minuter. Funktionen kan bara läsa och byteverifiera de bundlade originalen. Ett normalt [operatörsläge](SKYLLA_SUPABASE_AUTOMATION.md) med befintlig administratörssession finns också. KERBEROS signerade GET-metod finns kvar som alternativ när sådana kortlivade filer faktiskt finns.

Inga DELETE-rättigheter behövs för aktuell förberedelse. De kan ordnas först efter separat godkännande av en byteverifierad exakt batch, via en snävt avgränsad betrodd operatör. Privata app-WebP behöver också autentiserad kontroll före radering; de ingår aldrig i raderingslistan.

Drive-anslutningen kan skapa nya kopior och läsa tillbaka hela arkivbytesen; aktuellt antal finns i manifestet. CLI-adaptern kan i en senare miljö använda en privat tillförd kortlivad `SKYLLA_DRIVE_TOKEN` med läs-/kopieringskapabilitet till just Inbox-källorna och avsedda målmappar. Token anges aldrig som kommandoargument. HERMES-tjänstekontots `drive.readonly` har inte ändrats.

## Verktyg

`scripts/skylla_archive.py` använder KERBEROS fullständiga PNG-verifierare utan att ändra dess policy. `archive-drive` gör binär källhämtning, exakt metadatauppslag av innehållsadresserad målfil, opt-in `files.copy`, arkivreadback och bytejämförelse. POST är hårt begränsad till nya Drive-kopior; DELETE, move och filersättning finns inte. Ett atomiskt copy-intent är lås mot dubbla skrivningar. Oklart svar får inte återförsökas utan avstämning. Befintlig exakt arkivfil återläses och återanvänds.

Descriptorfält: `bucket`, `object_path`, `kind`, `target_key`, `expected_sha256`, `expected_size_bytes`, `inbox_file_id`, `target_folder_id`. Bucket måste vara `alea-hermes-source` och mål-ID måste matcha konfigurationens kategori/variant. Okänd kategori spärras. Standardläget skapar inga kopior.

```bash
python scripts/skylla_archive.py archive-drive \
  --descriptor /private/descriptor.json \
  --journal /private/skylla-copy-journal \
  --output /private/drive-readback.new.json
```

Lägg endast till `--enable-copy` i en uttryckligen avsedd arkivkörning. Gör inga nya kopior av de fem redan registrerade ID:na: använd readback/reuse. Den verkliga arkiveringen utfördes via Drive-connectorn och verifierades med samma `pair_proof`-funktion. Fristående `verify-pair` kan kontrollera två materialiserade bytefiler med descriptor och rå metadata. Output skapas exklusivt; inne i repot tillåts rapporter endast under `docs/skylla/`.

`eligibility` kräver aktuella Supabase-bytes, permanent Drive-readback, identiska hashvärden/längder, klara beroenden och verifierade visningsbilder/pekare. Evidens äldre än tio minuter spärrar förslaget. Separat batchgodkännande krävs fortfarande; funktionen sätter aldrig `safe_to_delete=true`. Sparad evidens måste uppdateras om arbetet återupptas senare. `archive_batch` redovisar ett separat resultat för varje fil; det är inte en raderingsbatch.

## Återställning från Drive

1. Läs manifestet och exakt permanent Drive-ID. Verifiera dess målparent, hela filens bytes, SHA-256, storlek och full PNG-avkodning. Använd en ny isolerad lokal plats; skriv inte över befintliga filer.
2. Kontrollera att det exakta Supabase-objektet faktiskt saknas. Stäm av jobb/ref-status. Skaffa separat godkännande för återställningsuppladdning och en tillfällig identitet för just det objektet.
3. Använd Supabase Storage-API för att skapa exakt ursprunglig bucket/path med `upsert=false`. Ändra inga tabeller, appreferenser eller HERMES-jobb. Kör aldrig HERMES-publiceraren för att återställa originalet; den kan publicera/aktivera visningsbilder som bieffekt.
4. Läs tillbaka Supabase-objektet autentiserat och jämför hela bytesen med Drive-kopian. Dokumentera återställningshändelsen i ett nytt kvitto. Skriv inte över ett redan befintligt objekt med annan identitet.

Fem verkliga Drive-download/readbacks har bevisat åtkomst till deras exakta originalbytes. Syntetiska tester provar återställningsjämförelsen. Ingen verklig återställningsuppladdning eller oberoende NAS-backup har skapats. Projektägarens dokumenterade residualrisk gäller endast denna source-bucket; det är inte en generell avstängning av backupkrav.

Dokumentation för privata signerade läsningar verifierades genom Supabases dokumentationssökning: [Storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals). Direkt changelog-hämtning var nätverksblockerad. Inga SDK-versioner, databaspolicys eller projektinställningar har ändrats.
