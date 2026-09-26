# D&D Campaign Generator

A browser app that generates complete D&D 5e (2024 rules) campaigns: villain, plot in acts, factions, NPCs, locations, dungeons, encounters and loot. It draws procedural maps and can optionally use AI for prose and images.

**Hybrid engine:** hand-written random tables build a structured, seeded skeleton. An optional LLM then rewrites it into connected prose, naming NPCs, factions and places across sections so it reads as one campaign. The app works fully without AI.

**Built for free and small models:**
- The AI replies in simple `@@KEY` labelled text blocks instead of JSON.
- Work is sent in small batches, with short keys (`N3`, `L2`).
- Rate limits and empty replies are retried automatically, and missing items are re-requested one at a time.
- `<think>` blocks are stripped.
- Output streams live into a panel, and a Stop button cancels the job.

## Features

- **Guided form:** tone(s) (heroic, dark, intrigue, exploration, comedic, mystery, war, nautical, planar, survival), level range, party size, length (3, 4 or 5 acts, or **Epic**: 7 acts, levels 1–20, with a mid-campaign lieutenant showdown), art style, free-text notes for the AI.
- **Party sheet:** each PC's name, species, class and backstory hook. Acts get PC spotlights, and the AI weaves the hooks into acts and sessions.
- **Session-by-session play:** the campaign is pre-planned into 3–4 hour sessions per act. Each session has:
  - a "previously…" recap and a strong start;
  - 5 scenes with read-aloud text, purpose, possible outcomes, NPCs, a music mood and encounters;
  - 8 secrets & clues, NPC dialogue, treasure and a prep checklist.
  After a game night, write what happened in the **play log**, and the next session is rewritten by the AI to follow from it.
- **Side quests** in every act, with a quest giver and a reward.
- **Ambient music:** 12 moods (tavern, dungeon, battle, boss, horror, sea…) generated live in the browser with the Web Audio API. No files, no network, no copyright. Every scene has a ♪ button that crossfades to its mood.
- **Table tools:** dice roller (`2d6+3`, `1d20 adv`, `4d6kh3`), initiative tracker with HP and conditions, and quick improvisation generators (NPC, names, encounter, loot, rumor, complication).
- **▶ Play mode:** an AI or human DM runs a session with any mix of AI and human players (hot-seat). Each seat can use its own provider and model.
  - **Free-flowing table:** outside combat the conversation is live (e.g. P1 → P2 → P1 → P4 → P1 → DM).
    - Whoever is addressed by name answers next; otherwise a short moderator call picks the character who would naturally react, or hands back to the DM.
    - Players may PASS. Limits: nobody speaks twice in a row, at most 3 lines each and about 2× the party size per round.
    - If nobody reacts, the DM moves the story forward.
    - A classic round-robin mode is also available.
  - **The code owns the rules:** dice, attacks with advantage/disadvantage from conditions, crits, resistances, saves, concentration, death saves, the action economy, opportunity attacks, recharge abilities, legendary actions, rests. The models only choose actions and narrate.
  - **Full character sheets** with a class/level template to start from. About 70 core spells are automated; any other spell or feature is adjudicated by the DM through tags that the engine rolls.
  - **Monster stat blocks** come from the SRD for every encounter.
  - **Tactical battle map** built from the scene (dungeon, cave, forest, town, open ground):
    - walls, obstacles that give cover, difficult terrain and water;
    - A* movement where you can pass through allies but enemies block, with an opportunity attack checked at every square;
    - line of sight and half or three-quarters cover (+2/+5 AC, and to Dex saves);
    - sphere, cube, cone and line areas that hit everyone inside, allies included;
    - Hide requires real cover;
    - optional flanking, and automatic Shield reactions.
  - **Voices:** the browser's built-in text-to-speech reads narration and dialogue, with a distinct, adjustable voice per speaker. Auto-play can wait for the voice to finish.
  - **Automatic images:** a picture for each scene and battle, and/or whenever the DM calls `[IMAGE …]`. Images appear in the chat, in the campaign's art style.
  - **Map interaction:** humans click to move, attack or aim spells. AI seats get an ASCII coordinate map and can `MOVE: to F7` or `CAST: Fireball at H9`.
  - **At the table:** auto-play with pause, step and speed controls; live streaming; a turn tracker with HP and conditions; private "director" notes to the DM; DM tools usable any time; automatic music moods.
  - **Memory:** the full transcript is sent each turn, and only the oldest part is summarized once it exceeds your budget.
  - **After the session:** the transcript becomes the session's play log.
- **Edit anything:** every description, read-aloud box, title and note can be edited by hand (✎).
- **Shareable seeds:** the same seed and options produce the same skeleton.
- **Campaign content:** villain (motivation, plan, weakness, lair, lieutenants, SRD stat block to reskin), acts with hooks, goals, climaxes and rewards, factions, NPCs with secrets and wants, rumor table.
- **Encounters** built with the 2024 DMG XP budget (Low / Moderate / High × party size), themed to the villain's minions. The final battle features the villain's stat block and warns when its CR doesn't fit the level.
- **Procedural SVG maps:**
  - Region map with terrain, roads and clickable location markers.
  - Dungeon maps on a 5-ft grid, with rooms numbered to match the room key, doors (locked/secret), traps, treasure and encounters.
  - Town maps with roads, walls, a river, and NPCs placed in the building that fits their role.
- **AI images, on demand:** NPC and villain portraits, faction emblems, location scenes, and illustrated maps (these are artistic and don't follow the exact layout).
- **Re-roll any single part:** villain, NPC, faction, location, dungeon/town layout, act or encounter. Links between parts stay intact.
- **Library:** save to the browser (IndexedDB), autosave once saved, JSON import/export for backups.
- **Export** to Markdown (optionally with embedded images) or print / save as PDF (all tabs are printed).

## AI providers

Configure these in **Settings**. Keys are stored only in your browser's localStorage and are sent only to the provider you pick.

| Text | Notes |
|---|---|
| OpenRouter | One key, many models. "Load models" lists them. |
| Anthropic | Direct browser call (uses `anthropic-dangerous-direct-browser-access`). |
| Groq | Fast; the free tier's rate limits may interrupt long expansions. |
| OpenAI | |
| Ollama / LM Studio | Local. Enable CORS (`OLLAMA_ORIGINS="*"`). |
| Custom | Any OpenAI-compatible `/chat/completions` server. |

| Images | Notes |
|---|---|
| Pollinations.ai | Free, no key. Can be slow or rate-limited. |
| OpenAI-compatible `/images/generations` | gpt-image-1, DALL·E, others. |
| OpenRouter image models | For example the Gemini image models. |
| Stable Diffusion WebUI (A1111 / Forge) | Launch with `--api --cors-allow-origins=<origin>`. |
| ComfyUI | Launch with `--enable-cors-header`; set the checkpoint file name. |

**Local models and the hosted site:** browsers generally block an HTTPS page (GitHub Pages) from calling `http://localhost`. To use Ollama, LM Studio, A1111 or ComfyUI, run the app locally with `npm run dev`.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
```

Stack: React 19, TypeScript, Vite. There is no backend.

## Deploy

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`. Enable it once under **Settings → Pages → Source: GitHub Actions**.

## License notes

Monster and magic item names in the generator reference the *System Reference Document 5.2* by Wizards of the Coast LLC.

Play mode's monster stat blocks (`src/data/srd/monsters.json`) include material taken from the *System Reference Document 5.1* by Wizards of the Coast LLC. They were converted with `scripts/build-srd.mjs` from Open5e's republication, via the npm package `@adkinn/fifth-edition-srd-mcp`. Both SRDs are licensed under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/). Where the generator uses a 2024 monster name that is missing from SRD 5.1, play mode uses the closest 5.1 stat block.

All tables, names and text generators are original.
