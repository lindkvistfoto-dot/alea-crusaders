# FÄRDIGHET IKON — scene briefs for the remaining 12 (October 2026)

These are **production briefs**, not finished/public images. The locked graphic master is `assets/skill-icons/klattra-frame-master.png`; the approved `Hoppa` icon is the sharpness/composition reference.

## Unframed scene requirements (all 12)
- Render **ONE** medieval-fantasy scene per file, no grids, montages, frame, gold edge, typography, watermarks or logos.
- Minimum **1024×1024 intrinsic** source pixels preferred; never upscale a small gallery icon and claim original resolution. User-approved standard is 1254×1254 RGBA PNG after exact-frame compositing.
- Female adventurer in worn green cloak, practical leather bracers, earth-tone clothing. Anatomically coherent hands/props, natural light, cinematic realism; distinctive readable action at 64–96 px.
- Place subject/props within a central circular-safe crop. The immutable frame is assembled separately with `scripts/skill_icon_compose.py`. True alpha only **outside** the final frame.
- **Semantic review is mandatory:** artwork must depict the skill name, not a vague related genre scene. The script only enforces mechanical image QA.

## Scene-by-scene art direction

| DB skill ID | Skill | Primary action — unambiguous scene | Distinction |
|---|---|---|---|
| `djurtraning` | Djurträning | Adventurer holds a clear *sit/stay* palm signal, alert trained hunting dog responding attentively at her feet in forest clearing | **Training**, not merely petting an animal or Zoologi |
| `finna_dolda_ting` | Finna dolda ting | Adventurer discovers a concealed compartment in a weathered chest or wall, uncovering a hidden key and dust marks | **Discovery of hidden item**, not trap disarm |
| `grottorientering` | Grottorientering | Inside branching stalactite cave, she reads chalk passage markings and a rough cave map by a lantern or torch | **Navigating cave passages**, not torch portrait |
| `hasardspel` | Hasardspel | Seated at rustic inn table, she throws visibly moving dice among coins, focused on opponents | **Gambling at table**, not solitary drinking |
| `ilmarsch` | Ilmarsch | Marching strenuously uphill with heavy travel pack, staff and windblown cloak, passing distance markers at dawn | **Strenuous rapid overland travel**, not casual stroll |
| `kanot` | Kanot | Sitting in a **small canoe**, two hands on wooden paddle, water wake and wooded shore | **Paddling canoe**, not rowing boat |
| `kora_vagn` | Köra vagn | She sits on the driver's bench, **holds horse reins**, harness and front edge of wooden wagon visible | **Driving wheeled wagon**, not riding saddle |
| `navigera` | Navigera | From ridge she triangulates mountains with compass and unfolded map, marked route prominent | **Map-and-compass route finding**, not generic landscape |
| `rida` | Rida | Dynamic three-quarter view of adventurer in saddle, riding horse forward with reins visible | **Mounted riding**, not driving wagon |
| `simma` | Simma | Clear swimming stroke in river or lake, shoulders and both hands interacting naturally with water | **Swimming motion**, not simply being wet |
| `skidakning` | Skidåkning | Traveler on historically plausible **wooden skis** gliding over snow through spruce forest, natural ski poles | **Skis visible**, no modern racing gear |
| `skridskoakning` | Skridskoåkning | Traveler in period clothing gliding on a **frozen lake**, visible strapped historic ice-skate blades and ice reflections | **Ice skating**, not skiing or modern rollerblades |

## No-go triggers (do not enqueue HERMES)
1. Scene is an icon grid, a cropped 200–300 px mosaic, or already includes a regenerated decorative rim.
2. Frame differs from original, diamond ornaments are red/altered, the original opaque rim pixels are changed, or image is not transparent outside the rim.
3. Action ambiguous, anatomy/gear inaccurate, artifact or inappropriate era.
4. Intrinsic source quality cannot match approved `Hoppa` sharpness.
5. Missing exact DB target mapping or no independently inspected final file.

After review, HERMES transfers **only** the individually approved original. Confirm `hermes_jobs.status=active`, exact `rule_skills.icon_path`, and successful publisher run before counting a skill complete.
