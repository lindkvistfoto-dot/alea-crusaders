-- Map projection for area spells based on Expert Magiboken pp. 42–46.
-- The book rule remains in the description; the ring model is a documented
-- 2D tactical abstraction and does not simulate height.
UPDATE public.rule_spells
SET description = 'Permanent skyddskub med nio stenar. Grundregel: 3 × 3 × 3 m (27 m³) vid EG 1. Magi som passerar gränsen i endera riktningen måste övervinna Antimagi EG 1. Föremål som passerar möter Energistråle EG 1. Bara skaparen kan avlägsna kuben; Skingra kan häva den. Kartabstraktion: markytan visas som centrumhexagon plus angränsande ring; varje extra EG som används till storlek lägger till en ring. Höjd hanteras inte på kartan.',
    effect_per_eg = 'Grundregel: EG 1 = 3 × 3 × 3 m. Extra EG ökar ett mått enligt grundregeln. Kartmodell: radie 1 hex vid EG 1; varje extra EG som läggs på storleken ökar radien med en hexring. Höjd är inte en kartparameter.',
    target_text = 'Välj centrumhex. Skyddszon på kartan: centrumhex plus angränsande ring vid EG 1; varje storleksgrad ökar området med en ring. Permanent barriär; kartytan anger gränsen, inte automatiska mål.',
    updated_at = now()
WHERE upper(name) = 'BESKYDDARE';
