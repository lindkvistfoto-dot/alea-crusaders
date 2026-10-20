# HERMES 4.0 — kodleverans och pilotstatus

Bas: senaste `main` vid arbetets start, `a6522ed3419861597b4b34ddea48ecb2caeaf5dd`, inklusive MINOTAURUS PR #129 och den lyckade STOPP-piloten. Arbetet använder befintlig checkout och en ny arbetsgren. Inga andra PR:er, Git-historik eller aktiva bilder ändras.

## Återanvänt och ändrat

MINOTAURUS hade redan ett gemensamt Actions-jobb för flera köfiler, gemensam WIF-autentisering, blobless/sparse checkout, PNG-verifiering i minnet, åtta WebP-profiler, per-bild-felisolering i publiceraren, immutable upload/readback, signerade URL:er, stabil jobbidentitet och compare-and-set-aktivering. Ingen ny publiceringsmotor behövdes.

HERMES 4.0 lägger till ett explicit manifest med 1–100 objekt, stöd för Work-formatets `records`, kontroll av både Inbox och permanent arkiv, pinning av register-ID utöver `spell_key`, högst tre samtidiga bildflöden, samlad JSON-/Actions-rapport, ett retry-manifest med enbart misslyckade objekt och tom-källbucket-kontroll. Den egna aktiveringen återställs med compare-and-set om en efterföljande kontroll misslyckas. Arkiv-ID:t följer med som permanent Drive-proveniens; PNG skrivs aldrig till disk i Actions.

Drive-kopieringen görs av Codex via den redan anslutna användaridentiteten, efter bildkontroll och före köläggning. Actions läser tillbaka arkivet med befintlig read-only WIF. Det undviker nya credentials och att försöka ge ett servicekonto ägande/lagringskvot i användarens My Drive. Den nya arkivfilen måste vara läsbar för samma HERMES-konto; koden rapporterar ett saknat lästillstånd per bild. Full arbetsgång och manifest finns i [README.md](README.md).

## Riktad verifiering

- 12 Python-batchtester: fem godkända, en trasig bland fem, felaktig käll-/arkivhash, saknat arkiv/visuellt godkännande, fel målformat, storleksgräns för batchen, dubblettmål, verify-läge, avbrott, felisolerad arkivbehörighet, delad token, begränsad samtidighet och retry som hämtar endast misslyckad bild.
- 5 befintliga MINOTAURUS-Python-tester verifierar kompatibel enkelbildskö, alla åtta konverteringsprofiler och originalspärren.
- 24 JavaScript-tester över fem relevanta filer, inklusive 8 nya exekverbara publiceringstester: fem cutout-aktiveringar, ett delfel, omkörning utan nya uploads, skyddad befintlig bild, korrupt återläsning, register-ID-pin, verifierat arkiv, tom källbucket och återställning efter misslyckad DB-återläsning.
- Python-kompilering, lokal TypeScript-syntaxkontroll och diff-/originalkontroll körs. Deno-typkontroll körs av befintlig MINOTAURUS-guard i PR:n; Deno är inte installerat i terminalmiljön.
- Ingen full testsvit eller felsökning av de 29 ärvda CI-felen ingår.

Tester med simulerad DB/Storage visar programbeteendet; de utges inte för livebevis.

## Actions-antal och tidsmätning

**En batch = en köfil = en publicerings-Action**, med gemensam installation och autentisering. Arkivsteget via Drive-anslutningen startar ingen Action. En medveten omkörning använder en ny körning för enbart återstående objekt.

[BENCHMARK.json](BENCHMARK.json) redovisar lokal PNG-kontroll, arkivhashkontroll och verklig Pillow-konvertering med syntetisk 1024×1024 RGBA-fixtur och simulerad läslatens 150 ms per Inbox-/arkivläsning. En mätning per fall; ingen Storage-upload, extern nätverkstid eller Actions-start ingår.

| Bilder | Arbetare | Tid | Typ |
|---:|---:|---:|---|
| 5 | 1 | 10,842 s | Uppmätt syntetiskt |
| 5 | 3 | 5,133 s | Uppmätt syntetiskt |
| 20 | 3 | 16,519 s | Uppmätt syntetiskt |
| 91 | 3 | 75,161 s | Linjär uppskattning från 20, inte uppmätt |

Femfallet blev cirka 2,1 gånger snabbare i denna mätning. Detaljrika verkliga original kan ta betydligt längre tid att konvertera. Verklig total körtid för femfilspiloten redovisas först från dess Actions-körning, inklusive installation/auth. Någon verklig 20-/91-batch har inte publicerats.

## Produktionsstatus före granskad merge

Oberoende SQL **2026-10-20 21:04:28 UTC** visar `alea-hermes-source` **0 objekt / 0 byte**. En sorterad snapshot av de sju bild-/identifieringsfälten för samtliga 91 besvärjelser har MD5 `60e895e5cb49bb85694b5f57a3afaf72` som jämförelsebas; bildintegritet använder SHA-256.

Vid inventeringen innehåller den konfigurerade rapportmappen fortfarande det tidigare HYDRA-manifestet och den tidigare HERMES4-stagingmappen. Dessa ersätter inte användarens fem **nya** Work-cutouts. Ingen verklig köfil ingår i denna PR och ingen publicering startas på merge av enbart koden.

| Efterfrågat livebevis | Status |
|---|---|
| Fem arkivoriginal | Väntar på nytt Work-manifest och arkivsteget |
| Fem återlästa WebP | 0 nypublicerade i detta uppdrag |
| Fem uppdaterade `cutout_path` | 0 ändrade i detta uppdrag |
| Actions run-ID för livepilot | Inte startad före granskad merge |
| Total verklig körtid | Redovisas efter livekörningen |

Nästa operativa steg efter granskad manuell merge är att ta emot/pinna det nya manifestet, kontrollera och arkivera just de fem bilderna via befintlig Drive-anslutning och köra en gemensam `mode=publish`-batch från `main`. Ingen automatisk merge är aktiverad.
