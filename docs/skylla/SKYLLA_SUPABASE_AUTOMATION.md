# SKYLLA – automatiserad privat byteverifiering i Supabase

## Levererad lösning

Den separata Edge Function `skylla-verify` är driftsatt i `wbmosmkirsitkonejzpg` med `verify_jwt=true`. **Verifieringsläget är avstängt som standard.** Ingen aktivering eller privat Storage-läsning har utförts. En verklig POST utan autentisering avvisades av plattformen med HTTP 401. HERMES-funktionen har inte ändrats.

En befintlig inloggad administratör kan automatiskt gå igenom den bundlade fillistan med [operatörsklienten](../../scripts/skylla_operator_verify.mjs). Ingen behöver skapa 519 länkar. Varken servernycklar, signerade länkar eller bildbytes skickas till Codex. Projektets inbyggda `SUPABASE_SERVICE_ROLE_KEY` används endast inne i funktionen för autentiserad binär GET från det fasta projektet och bucketen `alea-hermes-source`.

Servernyckeln har breda privilegier inom Supabase; dess begränsning här upprätthålls av den granskbara funktionskoden och fillistan, inte av en ny Storage-RLS-policy. Inga nycklar hämtas ur SQL/Vault och inga databaspolicys ändras. Användarens token kontrolleras av Auth `/auth/v1/user`. Exakt operatörs-UUID måste matcha serverkonfigurationen och `profiles.is_admin=true` måste kunna läsas med samma användares RLS-kontext. `user_metadata` ger ingen behörighet.

## Fast och verifierad fillista

[allowlist.json](../../supabase/functions/skylla-verify/allowlist.json) innehåller endast original som redan har permanent Drive-ID och fullständiga käll-/arkivbytebevis. [Byggverktyget](../../scripts/skylla_edge_plan.py) kräver matchande aktuellt manifest, exakt kategori-/variantmapp, SHA-256, storlek, två kompletta PNG-avkodningsbevis och separat arkiv-ID. Jobbhashar ensamma räcker inte. Fillistan är innehållsadresserad med SHA-256 och bundlas i driftsättningen.

Anroparen får endast skicka `{id, plan_sha256}`. Godtyckliga paths, bucket, checksumma, extern URL, signering eller skrivåtgärd avvisas. Funktionen gör inga Storage-/databas-skrivningar. Den skickar inga bildbytes eller tokens i svaret och reflekterar inga leverantörsfel.

Ett anrop läser ett objekt, begränsat till 8 MiB och 4 194 304 pixlar. Alla PNG-chunkars CRC och terminal IEND kontrolleras. Hela zlib-strömmen dekomprimeras med begränsad utdata, samtliga scanlines/filter rekonstrueras och pixelbytes hashberäknas. Stöd: 8-bitars RGB/RGBA utan interlace; andra färglägen, animerad PNG och `tRNS` spärras. Kategorins proportioner kontrolleras också. Inga transformationer görs. Timeout, saknad fil, ofullständig överföring och SHA-avvikelse ger blockerat resultat.

Den faktiska Storage-hashen jämförs med den verifierade Drive-hashen i den fasta listan. Detta är inte en ny Drive-readback vid själva serveranropet. Färskt Drive-/beroendeunderlag krävs fortfarande före ett eventuellt raderingsförslag.

## Återstående operatörssteg – inga breda nycklar till Codex

En behörig projektoperatör behöver konfigurera följande i Supabase, efter granskning av exakt kod och fillista:

| Variabel | Värde |
|---|---|
| `SKYLLA_ENABLED` | `true` under den avsedda körningen |
| `SKYLLA_OPERATOR_ID` | Exakt UUID för en befintlig Alea-administratör |
| `SKYLLA_OPERATOR_ORIGIN` | Exakt origin för administratörens betrodda Alea-sida |
| `SKYLLA_ENABLED_FROM` | Aktuell ISO-tid i UTC |
| `SKYLLA_ENABLED_UNTIL` | ISO-tid i UTC, högst en timme efter FROM |

Dessa fem värden är konfiguration, inte nya API-nycklar. Ingen Auth-användare skapas. Saknat, framtida, utgånget eller för långt tidsfönster ger HTTP 503 före privata läsningar. Sätt `SKYLLA_ENABLED=false` när körningen är klar; även utan detta löper fönstret ut. Befintlig service-role-/anon-konfiguration stannar på servern.

Administratören loggar in normalt i Alea. Den granskade operatörsmodulen kan läsas som lokal fil i webbläsarens utvecklarverktyg; appen behöver inte publiceras om. Modulen importerar inga externa bibliotek. Välj först `scripts/skylla_operator_verify.mjs`, därefter exakt `allowlist.json` från samma granskade checkout:

```js
const readLocalSkyllaFile = async () => {
  const [handle] = await showOpenFilePicker();
  return handle.getFile();
};
const skyllaModuleURL = URL.createObjectURL(await readLocalSkyllaFile());
const skylla = await import(skyllaModuleURL);
URL.revokeObjectURL(skyllaModuleURL);
const skyllaPlan = JSON.parse(await (await readLocalSkyllaFile()).text());
const skyllaClient = skylla.createAleaSkyllaClient({
  getToken: () => freshSupabaseAccessToken(),
  getPublishableKey: () => SUPABASE_KEY
});
const skyllaReceipts = await skylla.verifySkyllaPlan(skyllaClient, skyllaPlan);
const skyllaReportURL = URL.createObjectURL(new Blob(
  [JSON.stringify(skyllaReceipts, null, 2)], {type:'application/json'}));
const skyllaDownload = document.createElement('a');
skyllaDownload.href = skyllaReportURL;
skyllaDownload.download = 'SKYLLA_SERVER_VERIFICATION_RECEIPTS.json';
skyllaDownload.click();
setTimeout(() => URL.revokeObjectURL(skyllaReportURL), 10000);
```

Detta använder samma befintliga sessionsförnyelse och publika API-identifierare som `features/combat/hermes2.js`. Kopiera aldrig sessionstoken till chatt, Git, logg eller Codex. Körningen är sekventiell, sparar ett resultat per objekt och behåller blockerade resultat. Kvittot ska tillföras som vanlig rapport, utan autentiseringsmaterial. Efter avbrott kan en avgränsad delmängd av samma fasta lista verifieras igen genom att använda dess original-ID:n och samma planhash; driftsätt aldrig nya filer via anropspayloaden.

En projektoperatör med rätt att konfigurera funktionsmiljön och en befintlig inloggad Alea-administratör saknas i den aktuella körmiljön. Därför påstås ingen privat byteåtkomst vara löst eller någon verklig Storage-verifiering vara genomförd ännu.

## Tester och begränsningar

31 syntetiska JavaScript-tester passerar i både Node 24.19.0 och Deno 2.5.4. Fem Python-tester verifierar att serverlistan inte kan byggas från enbart metadata, fel permanent ID, fel mapp, ofullständig avkodning eller dubblettposter. Deno-kontroll av entrypoint passerar. Lokalt avkodades dessutom pilotens fem redan hämtade Drive-original; rekonstruerade pixelhashar matchade Pillow för samtliga, 102–153 ms per bild i denna miljö. Detta är inte ett prestandalöfte för Supabases produktionsruntime.

Supabases dokumenterade Edge-gränser är 256 MiB minne, två sekunder CPU per request och 150 sekunder worker-väggtid på Free. Lösningen läser en fil per request och använder en mindre minnesgräns för avkodade bilder. Verklig autentiserad femfilskörning måste fortfarande bekräfta driftbeteendet.

Alla positiva kvitton har `safe_to_delete=false` och `deletion_authorized=false`. Funktionen kontrollerar inte alla HERMES-beroenden eller privata WebP-visningsbilder. De grindarna och separat godkännande av exakta raderingsobjekt kvarstår. Ingen produktionsradering aktiveras av denna lösning.

Källor: [Edge runtime limits](https://supabase.com/docs/guides/functions/limits), [Auth integration](https://supabase.com/docs/guides/functions/auth-legacy-jwt), [Storage access](https://supabase.com/docs/guides/storage/buckets/fundamentals).
