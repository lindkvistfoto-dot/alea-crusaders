# SKYLLA Storage – 2026-10-20

| Mått | Resultat |
|---|---:|
| Aktuella Supabase-original | 519 |
| Metadataförd storlek i `alea-hermes-source` | 1 501 614 754 bytes |
| Permanenta Drive-kopior med full byte-readback | 5 / 14 199 932 bytes |
| Aktuella Supabase-original lästa som bytes | 0 |
| Raderingsklara Supabase-objekt | **0** |
| Blockerade Supabase-objekt | **519** |
| Utförda raderingar / frigjorda bytes | **0 / 0** |
| Villkorad potential för femfilspiloten | 14 199 932 bytes |
| Villkorad maximal potential enligt aktuellt inventarium | 1 501 614 754 bytes, cirka 1,50 GB / 1,40 GiB |

Den maximala potentialen är ingen prognos om säkert frigörbar volym. Varje objekt måste först klara aktuella byte-, arkiv-, referens- och beroendekontroller. Misslyckade jobb och oklassificerade källor kan behöva bevaras. **Nu verifierat frigörbart: 0 bytes.**

[SKYLLA_ARCHIVE_MANIFEST.json](SKYLLA_ARCHIVE_MANIFEST.json) innehåller exakt en post per aktuellt objekt, totalt 519. `source_actual_sha256=null` för samtliga; jobbens registrerade hash är tydligt separerad. Fem poster har verklig Drive SHA-256, permanent ID, version och readbackbevis. Övriga 514 har ännu inget SKYLLA-arkivbevis. Kandidat-CSV innehåller inga overifierade objekt.

Läsande Storage-metadata före/efter Drive-piloten visar oförändrat antal och volym för samtliga 14 buckets. Inga Supabase-skrivningar har gjorts. Se [tidigare snapshot](evidence/LIVE_APP_AND_STORAGE_SNAPSHOT.json) och [slutlig snapshot](evidence/FINAL_STORAGE_SNAPSHOT.json). Metadata är ett volymmått, inte en filintegritetskontroll.

Alla visningsbuckets är utanför policyn, inklusive `alea-hermes-public` (158 objekt / 25 564 008 bytes), `alea-spell-art` (220 / 65 991 104) och `alea-skill-art` (174 / 59 152 854). Dessa har inte ändrats. Inga databasrader, aktiva bildpekare, original i Git eller Git-historik ändrades.

## Nästa mätbara steg

Tillför exakt fem kortlivade signerade läskapabiliteter enligt [åtkomstdokumentationen](SKYLLA_ACCESS_AND_RESTORE.md). Verifiera aktuell Storage-fil mot dess permanenta arkivfil. Uppdatera beroenden och visningsbildskontroller och skapa ett nytt immutable kandidatmanifest. Projektägaren ska därefter godkänna de fem exakta paths som verkligen klarat kontrollerna.

Efter ett sådant separat beslut används endast Supabase Storage-API med explicit bucket och pathlista; ingen SQL-radering, inga globbar eller bucket-operationer. Kontrollera objektantal/metadata-bytevolym, appreferenser, visningsbilder och HERMES-status före/efter. Vid delvis misslyckad radering: stoppa, mät verkligt kvarvarande objekt och rapportera per path. Fortsätt inte med nästa batch. Ett återförsök kräver avstämning och nytt batchbeslut.

Ingen radering av något slag körs automatiskt av denna PR. Den är ett explicit policyundantag och verifierat Drive-pilotunderlag för granskning.
