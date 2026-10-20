# SKYLLA – driftsättningsbunden läskapabilitet

## Faktiskt verifierad åtkomst

Femfilspilotens privata Supabase-original har nu lästs och fullständigt PNG-avkodats inne i Supabase. Samtliga faktiska SHA-256 matchar de permanenta Drive-kopiorna. [Serverkvitton](evidence/SCOPED_PILOT_SERVER_RECEIPTS.json). Inga signerade objektlänkar, administratörssessioner eller breda API-nycklar tillfördes Codex. Inga raderingar utfördes.

Den befintliga Supabase-anslutningen har behörighet att driftsätta Edge Functions. Den behörigheten användes till att bundla en **fast, redan Drive-verifierad fillista** och hashvärdet av en ny, slumpmässig 256-bitars läskapabilitet. Själva kapabiliteten skapades lokalt med filrättighet `0600`, utanför Git. Endast dess SHA-256, planhash och ett kort giltighetsfönster skickades med funktionskoden. Detta är en ny snäv funktionstillgång, inte en exporterad Storage-/service-role-nyckel.

## Säkerhetsgränser

`skylla-verify-scoped` autentiserar varje request i [capability.mjs](../../supabase/functions/skylla-verify/capability.mjs). Därför har just denna separata funktion gatewayinställningen `verify_jwt=false`; den ersätts av den uttryckliga kryptografiska kapabilitetskontrollen. Anrop utan rätt kapabilitet avvisades i verklig drift med HTTP 401. Den vanliga `skylla-verify` behåller `verify_jwt=true` och kräver en administratörssession.

Kapabiliteten gäller högst 30 minuter och är bunden till exakt en bundlad planhash. Tillåtna anropsfält är bara `{id, plan_sha256}`. Inga godtyckliga buckets, paths, checksummevärden, URL:er, signeringar, skrivningar eller raderingar tillåts. Browser-Origin avvisas, CORS aktiveras inte. Request- och svarsstorlekar är begränsade, redirect nekas och nätverksläsningar har timeout. Hemligheten skickas endast i HTTPS-headern `X-SKYLLA-Capability` till den fasta projektadressen, aldrig som URL-parameter eller kommandoargument.

Serverns befintliga service-role-nyckel stannar inne i Supabase. Den används enbart för GET av det allowlistade originalet i `alea-hermes-source`. Ingen RLS-policy, databasrad, HERMES-funktion eller aktiv bildreferens ändras. Svaret innehåller endast verifieringskvitto, inte bildbytes, signerade länkar eller servernycklar. Samma fullständiga PNG-avkodare och SHA-kontroll används som i operatörsläget. Andra format/lägen än de uttryckligen stödda spärras.

Kapabiliteten är återanvändbar för samma läsningar under sitt korta fönster; den påstås inte vara engångsbruk. Inga beständiga DB-lås eller nya tabeller skapas för att räkna läsningar. En ny driftsättning kan byta scope/kapabilitet eller stänga av läsläget. Utgångstiden gäller även om en operatör glömmer avstängningen. Versions-/utgångsuppgifter sparas i körningsrapporten.

## Verktyg och körning

[skylla_scoped_verify.py](../../scripts/skylla_scoped_verify.py) skapar en lokal privat kapabilitet och en separat publik driftsättningsdescriptor. Utdata skapas exklusivt. Verktyget förbjuder kapabilitetsfiler inne i repot, symlänkar, svagare filrättigheter än `0600` och fönster över 30 minuter. Den publika descriptorn innehåller bara hemlighetens hash.

```bash
mkdir -m 700 /private/skylla-job
python scripts/skylla_scoped_verify.py issue \
  --plan /private/skylla-job/allowlist.json \
  --token-file /private/skylla-job/read.cap \
  --public-config /private/skylla-job/descriptor.json --minutes 15
```

En behörig driftsättare bundlar denna descriptor som `skylla-verify-scoped/capability.json`, exakt motsvarande allowlist som `skylla-verify/allowlist.json`, de två modulerna `core.mjs`/`capability.mjs` och funktions-entrypoint. **Bundla aldrig `read.cap`.** Repots `capability.json` har `enabled=false`; aktivt tillfälligt scope skapas bara för den avsedda läskörningen.

```bash
python scripts/skylla_scoped_verify.py verify \
  --plan /private/skylla-job/allowlist.json \
  --token-file /private/skylla-job/read.cap \
  --output /private/skylla-job/receipts
```

Klienten kontrollerar projekt, objekt, planhash, permanent Drive-ID, SHA-256, storlek, full avkodningsstatus och kvittots tid. Varje kvitto journalförs separat utan hemligheter. Första autentiserings-, överförings- eller integritetsfel stoppar körningen; kända fel återförsöks inte mot resterande lista. Återupptagning kräver avstämning och ett nytt, tydligt avgränsat jobb. Inga raderingsanrop finns.

Den första verkliga femfilskörningen passerade. Fortsatta kvitton och antal redovisas i huvudmanifestet och Storage-rapporten. Alla kvitton innehåller `safe_to_delete=false` och `deletion_authorized=false`. Färskt Drive-underlag, fungerande visningsbilder, verifierade beroenden och separat godkännande av exakt raderingsbatch kvarstår.

38 syntetiska JavaScript-tester passerar i Node och Deno; fem syntetiska Python-tester kontrollerar privat lagring, avgränsning, kvittoidentitet, felstopp och utgången evidens. Normal operatörsinloggning är en alternativ väg, dokumenterad i [operatörsläget](SKYLLA_SUPABASE_AUTOMATION.md).

## Separat kontroll av fem visningsbilder

`skylla-display-read` använder en egen fast femfilslista och separat kortlivad kapabilitet. Bara de tre visningsbucketarna `alea-hermes-public`, `alea-spell-art` och `alea-skill-art` accepteras; originalbucketen är uttryckligen förbjuden. Servern läser enbart exakt bundlade paths och jämför SHA-256/storlek innan råa WebP-bytes skickas binärt över HTTPS. Klienten `scripts/skylla_display_verify.py` verifierar RIFF-längd, SHA-256 och full Pillow-avkodning i en isolerad lokal plats. Inga Base64-bilder skickas genom textkanaler. Alla fem bilder passerade, inklusive tre privata. [Färska bildkontroller](evidence/APP_IMAGE_CHECKS_FRESH.json).

Denna läsåtkomst har stängts av efter kontrollen. Den ger inga skrivrättigheter och visningsbilder ingår aldrig i raderingsmanifestet. Tre syntetiska Python-tester provar komplett, avklippt och korrupt WebP; JavaScript-sviten provar även att femfilsscopet inte kan läsa original eller byta åtgärd.
