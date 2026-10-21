# HERMES 4.0 — en batch genom den befintliga kedjan

Detta dokument beskriver den befintliga pilotkedjan. Den nya Work-samordnaren, verifierad papperskorgshantering för nya batcher och kvarvarande driftsberoenden beskrivs i [ARTEMIS-automatiseringen](AUTOMATION.md). Dess ready-manifest är en separat ingång; gamla pilotmanifest startas inte automatiskt.

Kedjan är **bild → Inbox → bildkontroll → permanent Drive-arkiv → WebP → Supabase → Alea**. Codex gör Drive-arkivsteget med den befintliga anslutna användaridentiteten. Därefter kör en enda Actions-körning hela den befintliga intags-, konverterings- och publiceringskoden för alla objekt. Ingen ny publicerare, databas, tjänst eller originalbucket används.

## Varför arkivkopieringen använder Drive-anslutningen

`hermes-transfer@alea-hermes.iam.gserviceaccount.com` har redan fungerande read-only WIF på `main`. `files.copy` kräver ett skrivande OAuth-scope; `drive.readonly` kan inte kopiera. CHIMAIRA-mapparna ligger dessutom i användarens My Drive. Google anger att servicekonton saknar lagringskvot för ägda filer; att enbart begära ett bredare scope löser inte det problemet.

Behåll därför WIF-konfiguration, read-only-scope och Supabase-secret oförändrade. Använd den redan anslutna Drive-identiteten för server-side `copy_file`; ge samma befintliga HERMES-konto läsrätt till de nya arkivfilerna om de inte redan är läsbara för kontot. Ingen ägaröverföring, automatisk flytt/radering, ny nyckel, delegation eller generell skrivrätt för servicekontot behövs. Codex gör detta arbete; användaren behöver inte ladda ned eller flytta bilder manuellt.

Detta är två behörighetssteg inom samma batchuppdrag, med **en** publicerings-Action. Actions hävdar inte att den gjort en kopia: rapporten visar det faktiska arkiv-ID som den själv har läst och verifierat.

Källor: [Drive files.copy](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/copy), [Drive-fel och servicekontons lagringskvot](https://developers.google.com/workspace/drive/api/guides/handle-errors#storageQuotaExceeded).

## Work-manifest och köfil

Work ska leverera fem godkända original i Inbox `1qyNO8FWuxNup50L1oTWTWsCVQ6L3_gdp`, med exakt besvärjelse-ID, `spell_key`, Inbox-fil-ID, SHA-256 och bildtyp. Visuell granskning ska bekräfta rätt motiv, ingen bakgrundsplatta och ett helt synligt, obeskuret motiv. Verklig alfa, format, storlek och dimensioner verifieras också maskinellt. En alfakanal ensam bevisar inte motivets visuella kvalitet.

Efter arkivsteget normaliserar Codex till följande lilla JSON-köfil. `items` innehåller 1–100 objekt; femfilspiloten innehåller exakt de fem nya godkända bilderna. Exemplet nedan visar ett objekts fält, med tydliga platshållare; filen får inte läggas i kön ofylld.

```json
{
  "schema": 4,
  "mode": "publish",
  "items": [
    {
      "kind": "spell-cutout",
      "target_key": "<exakt spell_key>",
      "target_id": "<exakt rule_spells.id>",
      "drive_file_id": "<Inbox-originalets Drive-ID>",
      "archive_file_id": "<verifierad arkivkopias Drive-ID>",
      "source_sha256": "<64 hextecken från originalbytes>",
      "visual_approved": true
    }
  ]
}
```

Work-formatet `schema_version: "1.0"` med `records` stöds också när Codex uttryckligen lägger till `mode`. `image_type`, `spell_key`, `spell_id`, `inbox_file_id`, `sha256` och `quality_status: "approved"` mappas till motsvarande batchfält. `archive_file_id` används om det finns; det tidigare Work-formatets separata `drive_file_id` tolkas som arkiv-ID när `inbox_file_id` också finns. Ett Inbox-ID utan arkiv-ID är underlag för arkivsteget och får inte publiceras innan det kompletterats. Inget läge gissas till `publish`.

## Arkivsteg som Codex utför före köläggning

1. Läs Work-manifestets faktiska bytes och verifiera att det gäller de fem nya godkända objekten. Återanvänd inte tidigare HYDRA-bilder som ersättning. Läs tillbaka besvärjelsernas ID, nycklar och aktuella `cutout_path`; välj inga nya besvärjelser.
2. Läs varje Inbox-original via Drive-anslutningen. Använd `hermes_drive_intake.validate_png` och SHA-256 på faktiska bytes. Cutout-original ska vara kvadratiska RGBA-PNG, 1024–4096 px, högst 8 MiB och ha helt transparenta pixlar. Behåll originalbytes enbart tillfälligt utanför checkout och radera den lokala tillfälliga kopian efter kontroll. Originalet i Inbox lämnas kvar.
3. Slå upp målmappen i `config/hermes-drive-folders.json`. För cutouts är det `spell_types.cutout` = `1FrKbSXLq1hp7eE6J6O-lrKeK3Vj5n-of`. Återanvänd en befintlig arkivkopia endast efter kontroll av mapp, storlek och SHA-256. Annars använd anslutningens `copy_file` från exakt Inbox-ID till målmappen, med namnet `<source_sha256>.png`. Kopiera originalet oförändrat; ingen generering eller återexport.
4. Läs tillbaka arkivkopians bytes och verifiera SHA-256 och storlek mot Inbox-originalet. Spara det verkliga returnerade arkiv-ID:t i manifestet. Kontrollera att HERMES-servicekontot har läsrätt till just arkivfilen; använd befintlig Drive-delning till samma konto om rättigheten saknas. Ändra inga andra Drive-rättigheter.
5. Skriv en ny unik köfil med de fem objekten. Arkivfel för en bild rapporteras separat och ska åtgärdas utan att skapa dubbla kopior för redan färdiga objekt. Om ett ofärdigt objekt ändå ingår i batchen misslyckas bara det objektets arkivgrind.

När ett arkivoriginal är individuellt delat men arkivmappen inte är delad kan Drive utelämna `parents` för servicekontot. Intaget försöker då en avgränsad `files.list` med den konfigurerade mappen som direkt förälder och exakt filnamn, och kräver att det fastlåsta arkivfil-ID:t finns i ett fullständigt resultat. Ett annat ID med samma namn, ett ofullständigt resultat eller nekad åtkomst godtas aldrig. Om Drive inte kan ge detta bevis stoppas objektet med `FILE_PARENT_MEMBERSHIP_UNVERIFIED`. Ingen mappdelning, behörighetsändring eller bredare OAuth-scope görs som fallback. Liveverifiera beteendet med HERMES-identiteten efter godkänd merge.

Inga original flyttas från Inbox, laddas upp som GitHub-blobbar eller läggs i Supabase. Ingen ny långlivad originalkopia utanför Drive skapas.

## En Actions-körning och slutrapport

Efter granskad merge läggs **en** färdig `hermes/queue/<unikt-batch-id>.json` på `main` i **en** commit. Pushen startar `hermes-drive-intake.yml`. Gör inte också en manuell dispatch för samma startorder. Om kön redan ligger oförändrad på `main` kan en enda explicit dispatch med dess `request_path` användas i stället.

Checkout är fortfarande blobless/sparse. Python/Pillow, Deno och WIF installeras/autentiseras en gång. Intaget använder högst tre arbetare; publiceraren använder en delad Supabase-klient och högst tre samtidiga, oberoende mål. Dubbla mål för samma bildfält avvisas före hämtning/publicering. Jobbet har 30 minuters tak; token begärs med befintliga standardinställningar.

För varje objekt läser Actions Inbox-originalet, verifierar PNG och pinnen, läser arkivkopian ur rätt mapp och verifierar samma SHA-256. Först därefter får befintlig `prepare_bytes` skapa WebP. Cutouts blir **640×640**, quality 90 eller befintlig kvalitetsfallback, högst 500 000 byte, med pixelmässigt bevarad alfa efter skalningen. Works tidigare 1024×1024-stagingderivat används inte som publiceringsinput.

`hermes2_publish.ts` bekräftar att registerpostens ID matchar manifestet, laddar upp enbart WebP med `upsert=false` till privata `alea-spell-art`, verifierar Storage-download och signerad URL med SHA-256, och ändrar endast `rule_spells.cutout_path` genom compare-and-set. En annan befintlig cutout skyddas. Slutlig DB-återläsning och jobbstatus krävs för `active`. Ett fel efter den egna aktiveringen försöker återställa bara den egna pekaren med compare-and-set; om en samtidig ändring förhindrar säker återställning rapporteras `ACTIVATION_ROLLBACK_REVIEW_REQUIRED` för manuell kontroll.

`alea-hermes-source` kontrolleras tom före och efter publicering. Ett oväntat original stoppar publiceringsfasen; det raderas aldrig automatiskt.

Artifact **hermes4-batch-reports** innehåller endast JSON: intagsrapport, publiceringsrapport, `batch-report.json`, WebP-metadata och eventuellt `retry-request.json`. Actions Summary visar resultat per bild. Rapporterna anger felsteg, arkiv-ID, mål-ID, hash, bucket, sökväg, run-ID, kodcommit och uppmätta fasers tid. Total Actions-tid tas från körningens start/sluttid och omfattar även installation/autentisering.

## Delfel och omkörning

- Fyra godkända bilder kan publiceras även om en femte misslyckas. Körningen blir röd och rapporten visar exakt vilken bild och vilket steg som misslyckades. Tidigare bildreferenser skyddas; övriga bildfält ändras inte.
- Kopiera `retry-request.json` till en ny unik köfil på `main` efter att felet åtgärdats. Filen innehåller bara misslyckade objekt och deras arkivpinnar; lyckade original behöver då inte hämtas eller konverteras igen.
- Vid en avbruten publicerare klassas förberedda objekt utan slutbevis som misslyckade. Om ett sådant objekt redan hunnit bli aktivt kontrollerar befintlig jobbidentitet dess Storage/URL igen utan ny upload eller pekarändring.
- En full omkörning är också säker: redan aktiva jobb får `already_active`, utan ny WebP-upload eller ändrad historisk proveniens. Den vägen hämtar och konverterar fortfarande originalen; använd i första hand rapportens begränsade retry.
- `mode=verify` kontrollerar Inbox utan arkiv-/Storage-/registerskrivningar. `mode=pilot` gör den äldre isolerade MINOTAURUS-uppladdningen utan aktivering. Den begärda verkliga femfilspiloten använder uttryckligt `mode=publish`, efter granskad merge.

## Acceptans för verkliga piloten

Kör inte från PR-grenen och vidga inte WIF-trust. Efter granskad merge och mottaget nytt manifest ska rapporten visa fem läsbara SHA-verifierade arkivoriginal, fem återlästa WebP och fem matchande `cutout_path`. Kontrollera efteråt via oberoende SQL att källbucketen är 0 objekt/0 byte och att enbart avsedda cutout-fält ändrades. Redovisa faktisk run-ID, total Actions-tid och eventuella fel. Mobil-/combat-visning som inte provats får inte beskrivas som visuellt verifierad.

Ingen köfil med riktiga mål ingår i kod-PR:n. En merge kan därför inte av misstag starta publiceringen.
