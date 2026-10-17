# Alea Crusaders: FÄRDIGHET IKON — verified production gate

**Locked visual reference:** the user-approved *Klättra* gold frame, stored byte-for-byte at `assets/skill-icons/klattra-frame-master.png`. Use *Hoppa* for the approved composition and apparent sharpness. Never ask image generation to recreate or reinterpret the gold rim.

## Verified production workflow

1. Read `public.rule_skills` and select entries with missing `icon_path`. Do not use the `illustration_path` column in this process.
2. Make **one independent, unframed, square scene per skill**. The action must unambiguously show the skill. Keep the medieval-fantasy materials, lighting, and female adventurer consistent; vary scenery as needed. Art direction and semantic review are required by a person or the reviewing assistant before any publication.
3. Run `python scripts/skill_icon_compose.py --frame assets/skill-icons/klattra-frame-master.png --scene /path/to/scene.png --output /path/to/SKILL.png`. Source must have at least **640 × 640 genuinely sourced pixels**. The central transparent opening is automatically detected from the frame itself, not approximated with a generic ellipse. The original opaque frame pixels are asserted unchanged. Source and output checksums and a QA manifest are created.
4. Verify output visually: no old frame doubled behind the master, no old artwork fragments, no black or white background outside the rim, no artifacts at the four diamond corners, full motif visible, scene expresses correct skill, no distorted anatomy, details sharp at 640 px. Compare beside *Klättra* and *Hoppa*.
5. Create previews for sub-640 scenes with `--draft` **only**. Their QA status is `DRAFT_DO_NOT_PUBLISH`, and they cannot be treated as finished production assets. Upsampling does not create real source detail.
6. Transfer the specifically reviewed RGBA PNG through the existing HERMES temporary Drive inbox. Read back the actual uploaded Drive ID, then make **one GitHub commit** containing one distinct `hermes/queue/*.json` per batch item (`schema:1,kind:'skill',target_key:<rule_skills.id where underscores are hyphens>,drive_file_id:<verified ID>,mode:'publish'`). Be alert to GitHub concurrency/cancellation.
7. Wait for intake and HERMES 2.1 publication to finish. Re-read `hermes_jobs.status='active'`, verified `app_path`, and the identical `public.rule_skills.icon_path`; verify successful GitHub Actions runs. **A successful Drive upload or queue commit is not activation.** No manual `icon_path` update. Recheck status counts.

## Non-goals and isolation

The technical QA script **cannot determine** whether a scene depicts the right skill. Such a claim must be based on visual inspection of the actual final composition. Never publish collages that have merely been enlarged: historical generated 6×2 sheets yielded ca. 220 px intrinsic scenes and were insufficient for the approved *Hoppa* sharpness. Never touch existing skill icons or illustration columns as a side effect. A profile or master change needs explicit review.

To test compositor: `python -m unittest discover -s tests -p 'test_skill_icon_compose.py' -v`.
