# KERBEROS – återställningsprov

Datum: 2026-10-20. **Endast syntetiska filer. Inga produktionsoriginal exporterade, flyttade, ersatta eller raderade.**

## Utfört prov

En syntetisk 8×6 RGBA PNG om 78 bytes användes i ett komplett prov:

`5152d8c7117dc35af0e44423d83f6e16937b19741da541aa259c8a4b348fa077`

1. Källans faktiska bytes SHA-256-verifierades; CRC/IEND och full PNG-avkodning godkändes.
2. Simulatorn skapade en innehållsadresserad arkivkopia och läste tillbaka den.
3. Simulatorn exporterade kopian till separat lokal testlagring, kontrollerade SHA-256 efter export och registrerade backupplats/identitet.
4. Backupen öppnades igen, avkodades och jämfördes byte för byte med originalet: identiska bytes.
5. Samma körning upprepades: `already_present` för arkiv och backup, inga extra kopior.
6. Det riktiga exportverktygets dry-run skapade inga backupfiler. Därefter provades explicit export till en syntetiskt provisionerad extern testkatalog, följt av exportreadback och separat restore-readback: godkänt.
7. Ett syntetiskt Drive-readback registrerade permanent filidentitet och versionsmanifest. Inget Drive-API anropades i detta prov.

Maskinläsbart kvitto: [evidence/SYNTHETIC_RESTORE.json](evidence/SYNTHETIC_RESTORE.json). Kvittona anger `simulation=true` på övergripande nivå och `independent_production_backup_proven=false`. Lokala testkataloger är inte bevis för ett annat konto eller ett hållbart produktionsmedium.

## Automatiserad validering

`python -m unittest discover -s tests -p 'test_kerberos_archive.py' -v`: **28 tester godkända**.

Testerna täcker kompletta RGBA/RGB/palett-PNG, trasig CRC, saknad IEND, trunkerade pixels, efterföljande bytes, fel format, SHA-/storleksavvikelse, saknat original, dubbletter, separata relaterade versioner, deterministisk planering, innehållsadresserad idempotens, export och återställning. De provar även saknad/utgången autentisering, fel objekt/värd/bucket, fel Drive-ID/parent, korrupt readback, avbruten överföring, write guards, symlänkar, oförändrad källa, samma Drive-konto som felaktig backup samt samtliga sju versionsbundna rensningsgrindar.

Övriga relevanta tester:

- PR #119:s 15 syntetiska MEDUSA-tester: godkända från exakt granskad version.
- Befintliga HERMES Python-tester: 10 godkända.
- Fyra relevanta HERMES Vitest-filer: 19 tester godkända.
- Full Vitest på aktuell `main`: 1 266 godkända, 29 underkända i 17 filer. Exakt samma fel förekommer i PR #119:s CI; se [PR-granskningen](KERBEROS_PR119_REVIEW.md).
- Separat `npm run build` på baslinjen: Vite transformerade 95 moduler men processen avslutades med `Segmentation fault` (139) i arbetsmiljön. Bygget är inte godkänt. CI för PR #119 når inte byggsteget eftersom testerna stoppar tidigare. Ingen generell bygg-/CI-reparation ingår.

En isolerad GitHub Actions-workflow kör KERBEROS-testsviten utan produktionshemligheter, HERMES-publicering eller originalnedladdningar. Den övergripande CI-statusen ska läsas separat från detta avgränsade testresultat.

## Återstående produktionsbevis

**0 säkert arkiverade produktionsoriginal och 0 godkända för rensning.** Verklig Drive-readback från arkivets mål-ID, oberoende backup med separat åtkomstidentitet och restore från just den backupen återstår. Den syntetiska återställningen räcker för att prova verktyget men öppnar ingen produktionsgrind.
