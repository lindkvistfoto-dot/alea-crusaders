# SKYLLA – Storage efter arkivering

| Mått | Resultat |
|---|---:|
| Aktuella Supabase-original | 519 |
| Metadataförd source-volym | 1 501 614 754 bytes |
| Originalposter verifierade i Drive och från Supabase-bytes | 507 / 1 468 662 842 bytes |
| Unika permanenta Drive-filer | 506 / 1 465 949 422 bytes |
| Ännu inte arkiverade symboloriginal | 12 / 32 951 912 metadataförda bytes |
| Tekniska kandidater för första ägargodkännande | 5 / 14 199 932 bytes |
| Övriga objekt blockerade för raderingsförslag | 514 |
| Objekt godkända för faktisk radering | 0 |
| Utförda raderingar / faktiskt frigjorda bytes | **0 / 0** |

Kandidatvolymen är en villkorad besparing efter separat ägargodkännande, färska kontroller och lyckad Storage-radering. Den totala 1,50 GB-potentialen är inte automatiskt raderingsklar. 507 verifierade originalposter motsvarar cirka 1,47 GB; kvarvarande 12 har ännu inte byteverifierats mot permanent arkiv. Kvoten har inte minskat under denna icke-destruktiva körning.

Metadata före/efter visar oförändrade objektantal och bytevolymer i alla 14 buckets. Visningsbuckets och deras innehåll har bevarats. [Färsk Storage-snapshot](evidence/STORAGE_FRESH.json). Metadata är ett volymmått; de separata serverkvittona och Drive-readbackerna utgör integritetsbevisen.

Primär läsåtkomst är löst med tidsbegränsad, driftsättningsbunden kapabilitet. Inga 519 manuella länkar eller breda nycklar i arbetsmiljön behövs. Alla tillfälliga kapabiliteter har stängts av efter kontrollen. För framtida verifiering driftsätter en behörig operatör en ny fast avgränsad plan och ett kort fönster. [Åtkomst och återställning](SKYLLA_ACCESS_AND_RESTORE.md).

Efter godkänd femfilspilot: planera nästa batch, exempelvis högst 25 original, och verifiera dess egna käll-/arkivbytes, beroenden och visningsbilder på nytt. Begär separat godkännande av exakt pathlista före varje radering. Mät återstående objekt och metadata-bytevolym efter varje batch; kontrollera Aleas visningsbilder och referenser. Stoppa vid delvis misslyckande eller annan avvikelse. Radera aldrig en bucket, använd inga jokertecken och ändra aldrig `storage.objects` med SQL.
