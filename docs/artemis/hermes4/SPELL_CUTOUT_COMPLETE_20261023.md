# Alla besvärjelsecutouts färdiga

91 av 91 besvärjelser har nu en cutout i Supabase Storage och en verifierad `rule_spells.cutout_path`.

- 73 nya cutouts producerade; 18 tidigare cutouts och deras placering bevarade.
- Alla 73 PNG-original har äkta RGBA-transparens och minst 1024 × 1024 pixlar. HERMES levererar 640 × 640 WebP, högst 500000 byte, med verifierat bevarad alfa.
- 73 Inbox-original och 73 permanenta arkivkopior återlästa som verkliga binärfiler: 146/146 SHA-256 och filstorlekar matchar.
- Sex produktionskörningar: 5 + 12 + 12 + 12 + 12 + 20 lyckade, inga misslyckade mål.
- Nya bilder är granskade mot den faktiska spelramen och placerade med x50/y90/skala125; slutvärden återlästa.
- Ikon-, kvadrat- och WIDE-fält är oförändrade för samtliga 91 besvärjelser.
- Sju saknade ikonfält löstes för bildproduktionen genom återfunna namngivna Drive-original. Ikonfälten ändrades inte.
- `alea-hermes-source`: 0 objekt, 0 byte. Inga bildoriginal finns i de nya GitHub-committarna.

Verifiering: Supabase DB/Storage, faktiska HERMES-hashåterläsningar, källkodens bildkoppling och lokal kontroll mot spelramen. Live Alea-UI har inte granskats, enligt användarens instruktion att arbeta via Supabase och GitHub.

## Produktionskörningar

| Grupp | Nya bilder | HERMES-körning |
|---|---:|---|
| 1 | 5 | [39936373802](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39936373802) |
| 2 | 12 | [39944220509](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39944220509) |
| 3 | 12 | [39949374751](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39949374751) |
| 4 | 12 | [39950170177](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39950170177) |
| 5 | 12 | [39956327860](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39956327860) |
| 6 | 20 | [39957137683](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39957137683) |

Exakta originalhashar, Drive-ID:n, WebP-hashar, sökvägar och slutliga databasrader finns i batchmanifesten och 91-radersmatrisen i samma katalog.
