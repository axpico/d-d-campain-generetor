# D&D Campaign Generator

A browser app that generates complete D&D 5e (2024 rules) campaigns: villain, plot in acts, factions, NPCs, locations, dungeons, encounters and loot. It draws procedural maps and can optionally use AI for prose and images.

**Hybrid engine:** hand-written random tables build a structured, seeded skeleton. An optional LLM then rewrites it into connected prose, naming NPCs, factions and places across sections so it reads as one campaign. The app works fully without AI.

## Features

- **Guided form:** tone(s) (heroic, dark, intrigue, exploration, comedic, mystery, war, nautical, planar, survival), level range, party size, length (3–5 acts), art style, free-text notes for the AI.
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

Monster and magic item names reference the *System Reference Document 5.2* by Wizards of the Coast LLC, licensed under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/). All tables, names and text generators are original.
