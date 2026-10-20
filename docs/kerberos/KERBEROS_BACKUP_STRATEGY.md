# KERBEROS – oberoende backup och återställning

Status 2026-10-20: implementerat protokoll och syntetiskt prov. **Ingen produktionsbackup är skapad eller bevisad.** `06 – SÄKERHETSKOPIOR` på samma Drive-konto räknas aldrig som oberoende backup.

## Modell

Behåll Drive som permanent originalarkiv. Välj separat S3-/Azure-konto med separat administratör, eller ett krypterat offline-medium hos separat förvaltare. En GCS-lösning måste ligga på ett separat konto med separat åtkomst/återställningsidentitet. Kontot ska överleva förlust av Aleas Drive-konto. Produktionsval, lagringsplats och nyckelförvaltare är ännu inte beslutade.

För varje innehållsversion lagras oförändrade bytes under SHA-256, storlek, originalets permanenta Drive-ID, registerkoppling, batch/Inbox-ID och versionsidentitet. Backupinventariet innehåller provider, konto, objekt-/versions-ID, plats och ansvarig. Manifest och återställningsinstruktion sparas även hos backupförvaltaren. Krypteringsnycklar och återställningsidentitet får inte finnas enbart i Drive. Aktivera versionsbevarande/retention hos vald leverantör; verktyget ändrar ingen sådan konfiguration.

## Implementerat verktyg

`scripts/kerberos_archive.py` har separata steg för:

1. `verify-local`: kontrollera hela källans bytes, PNG-CRC/IEND och full avkodning.
2. `verify-drive` / `register-readback`: återläs exakt Drive-ID, verifiera rätt målparent, MIME och storlek, avkoda och jämför SHA-256 och källbytes. Enbart metadata ger inget arkivkvitto.
3. `export-backup`: exportera till en i förväg provisionerad separat monterad backupplats. Standard är dry-run. Explicit `--enable-backup-export` krävs för att skapa en ny innehållsadresserad kopia. Befintliga filer verifieras igen och skrivs aldrig över.
4. Återläs exporten, kontrollera SHA-256 och full PNG-avkodning, öppna backupen igen och jämför återställda bytes med källan. `restore-test` kan köras separat från en ny autentiserad materialisering av backupen.
5. Spara separata, exklusivt skapade JSON-kvitton. Samma innehåll får samma objektidentitet vid omkörning. En avbruten kopia spärrar återförsöket tills den utretts; den ersätts aldrig automatiskt.

Monteringen sköts av backupförvaltaren. Ingen molnleverantörs uppladdningsbehörighet tillförs i denna PR. För en objektlagringsmontering måste förvaltaren även göra en ny fjärrnedladdning med separat återställningsidentitet: lokal cache är inte bevis för beständig fjärrlagring. Registrera leverantörens riktiga versions-ID i återställningsinventariet. Exportverktygets SHA-256-ID är en innehållsidentitet, inte ett påstått leverantörskvitto.

Backupplatsen måste ligga utanför repot och innehålla `.kerberos-backup-destination.json`, exempel utan hemligheter:

```json
{
  "provider": "offline_encrypted",
  "account": "separate-custodian",
  "location": "approved-offline-volume",
  "custodian": "project-owner-designated-custodian",
  "provisioning_evidence": "owner-reviewed-inventory-reference"
}
```

Markören är en operatörsuppgift och bevisar inte oberoende. Alla export-/restorekvitton behåller `independence_verified=false`. Rensningsgrinden kräver en separat granskad, versionsbunden oberoendeattest inklusive exakt backupidentitet. Google Drive som provider avvisas.

```bash
python scripts/kerberos_archive.py export-backup \
  --file /private/materialized-original.png \
  --descriptor /private/original-descriptor.json \
  --destination /mounted-independent-backup \
  --output /private/backup-dry-run.json
```

Detta är bara ett kommandorecept; ingen sådan produktionskörning har gjorts. Nästa körning ska få ett nytt rapportnamn. `--enable-backup-export` används endast i en separat godkänd pilot med provisionerad plats.

## Återställningsplan

Vid förlust av Drive: hämta manifestet och exakt backupversion hos den oberoende förvaltaren med den separata identiteten. Återställ till en ny isolerad plats. Kör full byte-/PNG-verifiering och jämför med manifestets SHA-256 och storlek. Bevara misslyckade exemplar för utredning. Skapa därefter en ny Drive-kopia i en separat godkänd operation, läs tillbaka den och registrera dess nya permanenta ID som en uttrycklig återställningshändelse. Ändra inga appreferenser automatiskt. Gamla identiteter och manifest bevaras.

Före rensning krävs dokumenterad beroendeinventering, prov från den riktiga backupen och projektägarens uttryckliga beslut. `check-cleanup-gates` räknar samtliga sju villkor, bundna till SHA-256, versions-ID och Drive-ID. Externa attester kräver namngiven granskare, tid och evidensreferens; de är operatörsuppgifter som projektägaren måste granska. Även om alla villkor uppfylls är `phase_allows_deletion=false` och `safe_to_delete=false` i denna utvecklingsfas. Ingen raderingsfunktion finns.

## Syntetisk simulering

`simulate` kräver en lokal `.kerberos-simulation.json` med `simulation=true` och en matchande kapabilitet. Två separata lokala kataloger provar export/readback/restore, men markeras uttryckligen som simulering och räknas **inte** som oberoende produktionsbackup. Se [återställningsrapporten](KERBEROS_RESTORE_TEST_REPORT.md).
