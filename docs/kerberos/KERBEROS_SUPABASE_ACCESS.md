# KERBEROS – privat Supabase-läsning

## Nuvarande status

**0/519 aktuella privata objekt byteverifierade.** MEDUSA-SHA:s 519 metadata-/jobbrader är inte aktuella Storage-bytes. Historisk SHA-256, filnamn, storlek eller SQL-läsning kan inte ersätta binär nedladdning. Ingen ny autentiseringsloop eller privat produktionsnedladdning har körts i KERBEROS.

Miljökontrollen visade inga tillförda Supabase Storage-credentials. Befintlig Supabase-anslutning ger dokumentations-/databasfunktioner men ingen åtkomstkapabilitet för dessa privata binärobjekt. Repot, tabeller, RLS och HERMES har lämnats orörda.

## Prioriterad lösning: signerad GET per objekt

En redan behörig, betrodd operatör skapar kortlivade signerade nedladdningslänkar för exakt de valda objekten i `alea-hermes-source`. Börja med ett objekt och högst fem i en senare pilot. Rekommenderad giltighet är 300 sekunder. Den betrodda operatören behåller sin befintliga autentisering; Codex behöver ingen service-role-/secret-nyckel.

Använd befintlig betrodd Supabase-serverklient:

```js
const { data, error } = await supabase.storage
  .from('alea-hermes-source')
  .createSignedUrl(exactManifestObjectPath, 300);
// Skriv data.signedUrl direkt till en privat kapabilitetsfil, aldrig till logg.
```

Detta recept är dokumentation och har inte körts mot produktion. Ingen ny Edge Function eller databaspolicy driftsätts här. Skapandet av signerade länkar kräver behörig SELECT-åtkomst till objekten; det ger mottagaren en tidsbegränsad läskapabilitet för respektive objekt, utan INSERT/UPDATE/DELETE. En bred servernyckel ska inte flyttas till arbetsmiljön för detta.

För varje original tillförs via en privat fil, utanför repot och med läge `0600`:

```json
{
  "object_path": "spell/example/actual-sha256.png",
  "sha256": "<64 lowercase hex from the manifest>",
  "size_bytes": 123456,
  "expires_at": "<UTC expiration no more than one hour ahead>",
  "signed_url": "<private signed download URL for this exact object>"
}
```

Separat descriptor innehåller `object_path`, `sha256` och `size_bytes`. Kapabiliteten får aldrig skickas i chatten, läggas i GitHub, anges som CLI-argument eller skrivas i rapporter. `--ticket-file` anger bara den privata filens sökväg.

```bash
python scripts/kerberos_archive.py verify-supabase \
  --ticket-file /private/supabase-object-ticket.json \
  --descriptor /private/original-descriptor.json \
  --output /private/supabase-verification.json
```

Läsaren accepterar bara HTTPS mot `wbmosmkirsitkonejzpg.supabase.co`, bucket `alea-hermes-source`, exakt objektpath och en `token`-parameter. Den kontrollerar kapabilitetens identitet och giltighet (högst en timme), förbjuder redirect, gör endast GET, begränsar byteantal och verifierar SHA-256, storlek och full PNG-avkodning. Leverantörsfel, URL och svarskroppar skrivs aldrig ut. Rapporten innehåller inte kapabiliteten. Ingen automatisk förnyelse eller retry finns.

Viktig begränsning: filens `expires_at` är en klientkontroll. Den kan inte förkorta en felaktigt lång giltighet som utfärdats av operatören. Operatören måste därför faktiskt signera med 300 sekunder. Supabases dokumentation beskriver separat signeringsnyckel samt CDN-cache som kan leva längre än tokenens giltighet; roterade Auth-nycklar är ingen garanti för återkallning. Använd färska kortlivade länkar och överför dem som hemligheter. Gör aldrig original publika eller radera dem för att återkalla en länk.

Alternativ vid hårdare krav på åtkomststopp: en betrodd binär strömningsbroker som kontrollerar projekt, manifest-allowlist och kortlivad session vid varje GET, eller en redan tillgänglig kortlivad användar-JWT vars existerande RLS endast medger SELECT på exakta objekt. Sådana produktionskomponenter/åtkomstpolicyer är inte införda här. Direkt JWT-läsning är inte implementerad i detta verktyg.

## Vad som behöver ordnas

1. En behörig operatör som kan utfärda signerad GET för valda exakta objektpaths.
2. Privat leverans av kortlivade kapabilitetsfiler till verifieringsmiljön; inga länkar eller nycklar i PR/Issue/loggar.
3. Nätverksåtkomst till projektets HTTPS-endpoint via den ordinarie proxyn. Domänen är konfigurerad i miljöpolicyn; detta är inte i sig Storage-autentisering.
4. För hela inventeringen: en kapabilitet per vart och ett av de 519 objekten, med oberoende felrapportering och utan att ersätta overifierade rader med jobbhashar.

Syntetiska tester provar lyckad binär hämtning, saknad/utgången autentisering, fel värd/bucket/path/hash, trunkerad hämtning, byteavvikelse och sanerade fel. En lyckad verklig Storage-GET återstår.

## Verifierat dokumentationsunderlag

Supabases aktuella dokumentation hämtades genom `supabase_search_docs` 2026-10-20:

- [Private buckets och åtkomstmodell](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Privat nedladdning och signering](https://supabase.com/docs/guides/storage/serving/downloads)
- [Signed URLs och CDN-cache](https://supabase.com/docs/guides/storage/cdn/smart-cdn)

Försök att läsa changelog direkt från arbetsmiljön var blockerat; ingen aktuell changelog har kunnat verifieras. Ingen Supabase-SDK uppgraderas eller produktionskonfiguration ändras.
