import { useRef, useState } from 'react';
import type { Campaign, Location, Npc } from '../lib/types';
import { ART_STYLES, TONES } from '../data/story';
import {
  addNpc, rerollAct, rerollDungeon, rerollEncounter, rerollFaction, rerollLocation, rerollNpc, rerollTown, rerollVillain,
} from '../gen/campaign';
import { expandAll, expandOne, expandSection, mergeAi, type EntityKind } from '../ai/expand';
import { factionPrompt, locationMapPrompt, locationPrompt, npcPrompt, regionMapPrompt, villainPrompt } from '../ai/image';
import { campaignToMarkdown, download, slug } from '../lib/markdown';
import { RegionMap, REGION_LEGEND } from '../maps/RegionMap';
import { DungeonMap } from '../maps/DungeonMap';
import { TownMap } from '../maps/TownMap';
import { ImageSlot } from './ImageSlot';
import { AiButton, EncounterCard, Field, Loot, Pill, Reroll } from './bits';
import { Editable } from './Editable';
import { SessionsView } from './SessionsView';
import { PlayView } from './play/PlayView';
import { useApp } from './context';

type Tab = 'overview' | 'acts' | 'sessions' | 'play' | 'npcs' | 'factions' | 'locations' | 'maps';
const TABS: [Tab, string][] = [['overview', 'Overview'], ['acts', 'Acts'], ['sessions', 'Sessions'], ['play', '▶ Play'], ['npcs', 'NPCs'], ['factions', 'Factions'], ['locations', 'Locations'], ['maps', 'World map']];

export function CampaignView({ c, onChange, saved, onSave, onNew }: {
  c: Campaign;
  onChange: (c: Campaign) => void;
  saved: boolean;
  onSave: () => void;
  onNew: () => void;
}) {
  const { llm, toast, runAi, aiBusy } = useApp();
  const [tab, setTab] = useState<Tab>('overview');
  const [focusLoc, setFocusLoc] = useState<string>();
  const [playSession, setPlaySession] = useState<string>();
  const [embed, setEmbed] = useState(true);
  // Always read the newest campaign inside async AI callbacks.
  const latest = useRef(c);
  latest.current = c;

  const style = ART_STYLES.find((s) => s.id === c.options.artStyle)?.prompt ?? ART_STYLES[0].prompt;
  const npcName = (id?: string) => c.npcs.find((n) => n.id === id)?.name;
  const locName = (id?: string) => c.locations.find((l) => l.id === id)?.name;
  const facName = (id?: string) => c.factions.find((f) => f.id === id)?.name;

  const patch = (fn: (c: Campaign) => Campaign) => onChange({ ...fn(latest.current), updatedAt: Date.now() });
  const setNpc = (id: string, p: Partial<Npc>) => patch((x) => ({ ...x, npcs: x.npcs.map((n) => (n.id === id ? { ...n, ...p } : n)) }));
  const setLoc = (id: string, p: Partial<Location>) => patch((x) => ({ ...x, locations: x.locations.map((l) => (l.id === id ? { ...l, ...p } : l)) }));

  async function doExpandAll() {
    let failed: string[] = [];
    const ok = await runAi('Expanding the whole campaign', async (cb) => {
      const r = await expandAll(llm, latest.current, { ...cb, onUpdate: (x) => onChange(mergeAi(latest.current, { ...x, aiExpanded: true })) });
      failed = r.failed;
      onChange(mergeAi(latest.current, r.campaign));
    });
    if (!ok) return;
    if (failed.length) toast(`AI expansion finished, but ${failed.length} item(s) got no text: ${failed.slice(0, 6).join(', ')}${failed.length > 6 ? '…' : ''}. Use ✨ on them to retry.`, 'error');
    else toast('AI expansion complete.', 'info');
  }

  async function aiOne(kind: EntityKind, id: string) {
    await runAi(`Writing ${kind}`, async (cb) => {
      const text = await expandOne(llm, latest.current, kind, id, cb);
      patch((x) => {
        switch (kind) {
          case 'villain': return { ...x, villain: { ...x.villain, description: text } };
          case 'npc': return { ...x, npcs: x.npcs.map((n) => (n.id === id ? { ...n, description: text } : n)) };
          case 'faction': return { ...x, factions: x.factions.map((f) => (f.id === id ? { ...f, description: text } : f)) };
          case 'location': return { ...x, locations: x.locations.map((l) => (l.id === id ? { ...l, description: text } : l)) };
          case 'act': return { ...x, acts: x.acts.map((a) => (a.id === id ? { ...a, description: text } : a)) };
        }
      });
    });
  }

  async function exportMd() {
    try {
      download(`${slug(c.title)}.md`, await campaignToMarkdown(c, embed));
    } catch (e) {
      toast(`Export failed: ${(e as Error).message}`, 'error');
    }
  }

  function print() {
    // Every section is in the DOM; print CSS reveals the hidden tabs.
    window.print();
  }

  const goLoc = (id: string) => { setFocusLoc(id); setTab('locations'); setTimeout(() => document.getElementById(`loc-${id}`)?.scrollIntoView({ behavior: 'smooth' }), 50); };
  const LocLink = ({ id }: { id: string }) => <button className="link" onClick={() => goLoc(id)}>{locName(id)}</button>;
  const aiOff = !llm.enabled;
  const v = c.villain;

  return (
    <div className="campaign">
      <header className="campaign-head">
        <div>
          <h1><Editable inline value={c.title} onSave={(v) => patch((x) => ({ ...x, title: v || x.title }))} /></h1>
          <div className="muted">
            {c.tones.map((t) => TONES.find((x) => x.id === t)?.label).join(' · ')} — Levels {c.options.startLevel}–{c.options.endLevel} · {c.options.party?.length ? c.options.party.map((p) => p.name).filter(Boolean).join(', ') : `${c.options.partySize} players`} · {c.region.name} · seed <code>{c.options.seed}</code>
          </div>
        </div>
        <div className="toolbar no-print">
          <button className="btn primary" onClick={onSave} disabled={saved}>{saved ? '✓ Saved' : '💾 Save'}</button>
          <button className="btn" onClick={doExpandAll} disabled={aiOff || aiBusy} title={aiOff ? 'Configure an AI provider in Settings' : 'Write everything with AI: pitch, villain, factions, NPCs, locations, acts and every unplayed session'}>✨ Expand all with AI</button>
          <button className="btn" onClick={exportMd}>⬇ Markdown</button>
          <label className="check small" title="Embed generated images as data inside the .md (bigger file, works offline)">
            <input type="checkbox" checked={embed} onChange={(e) => setEmbed(e.target.checked)} /> embed images
          </label>
          <button className="btn" onClick={print}>🖨 Print / PDF</button>
          <button className="btn" onClick={() => download(`${slug(c.title)}.json`, JSON.stringify(c), 'application/json')} title="Backup (images not included)">⬇ JSON</button>
          <button className="btn ghost" onClick={onNew}>＋ New</button>
        </div>
      </header>

      <nav className="tabs no-print" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
            {label}
            {id === 'npcs' && <span className="count">{c.npcs.length}</span>}
            {id === 'sessions' && <span className="count">{c.sessions.length}</span>}
            {id === 'locations' && <span className="count">{c.locations.length}</span>}
          </button>
        ))}
      </nav>

      {/* ---------------- Overview ---------------- */}
      <section className={`tab-panel ${tab === 'overview' ? '' : 'tab-hidden'}`}>
        <h2 className="print-only">Overview</h2>
        <div className="card">
          <div className="card-head"><h3>Pitch</h3><AiButton disabled={aiOff || aiBusy} onClick={async () => {
            await runAi('Writing pitch and villain', async (cb) => { const r = await expandSection(llm, latest.current, 'overview', cb); onChange(mergeAi(latest.current, r.campaign)); });
          }} /></div>
          <Editable value={c.pitch} onSave={(v) => patch((x) => ({ ...x, pitch: v }))} />
          <div className="muted small">Themes: {c.themes.join(' · ')}</div>
        </div>

        <div className="card villain">
          <div className="card-head">
            <h3>☠ {v.name}</h3>
            <Pill kind="enemy">Villain</Pill>
            <span className="spacer" />
            <AiButton disabled={aiOff || aiBusy} onClick={() => aiOne('villain', v.id)} />
            <Reroll onClick={() => onChange(rerollVillain(c))} title="Re-roll villain (keeps lieutenants)" />
          </div>
          <div className="with-image">
            <ImageSlot imageId={v.imageId} label="portrait" prompt={() => villainPrompt(v, style)} onChange={(id) => patch((x) => ({ ...x, villain: { ...x.villain, imageId: id } }))} />
            <div>
              <Field label="Archetype">{v.archetype} <span className="muted">({v.species})</span></Field>
              <Field label="Stat block">{v.statBlock} <span className="muted">(reskin from the SRD / Monster Manual)</span></Field>
              <Field label="Motivation">{v.motivation}</Field>
              <Field label="Plan">{v.plan}</Field>
              <Field label="Weakness">{v.weakness}</Field>
              <Field label="Lair">{v.lair}</Field>
              <Field label="Appearance">{v.appearance}</Field>
              <Field label="Lieutenants">{v.lieutenants.map((id) => npcName(id)).join(', ')}</Field>
            </div>
          </div>
          <Editable value={v.description} placeholder="No backstory yet: ✨ to write it with AI, or ✎ to write your own." onSave={(t) => patch((x) => ({ ...x, villain: { ...x.villain, description: t } }))} />
        </div>

        <div className="card">
          <h3>Rumors <span className="muted small">(d{c.rumors.length})</span></h3>
          <ol>{c.rumors.map((r, i) => <li key={i}>{r}</li>)}</ol>
        </div>

        <div className="card">
          <h3>Campaign at a glance</h3>
          <ol className="act-glance">
            {c.acts.map((a) => (
              <li key={a.id}><button className="link" onClick={() => setTab('acts')}><strong>Act {a.number}: {a.title}</strong></button> <span className="muted">(levels {a.levels[0]}–{a.levels[1]})</span> — {a.summary}</li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- Acts ---------------- */}
      <section className={`tab-panel ${tab === 'acts' ? '' : 'tab-hidden'}`}>
        <h2 className="print-only">Acts</h2>
        {c.acts.map((a) => (
          <article className="card act" key={a.id}>
            <div className="card-head">
              <h3>Act {a.number}: {a.title}</h3>
              <Pill>Levels {a.levels[0]}–{a.levels[1]}</Pill>
              <span className="spacer" />
              <AiButton disabled={aiOff || aiBusy} onClick={() => aiOne('act', a.id)} />
              <Reroll onClick={() => onChange(rerollAct(c, a.id))} title="Re-roll act (keeps locations & NPCs)" />
            </div>
            <p>{a.summary}</p>
            <Editable value={a.description} placeholder="✨ to write this act out with AI, or ✎ to write your own." onSave={(t) => patch((x) => ({ ...x, acts: x.acts.map((y) => (y.id === a.id ? { ...y, description: t } : y)) }))} />
            <Field label="Hook">{a.hook}</Field>
            <Field label="Goals"><ul className="inline-list">{a.goals.map((g, i) => <li key={i}>{g}</li>)}</ul></Field>
            <Field label="Locations">{a.locationIds.map((id, i) => <span key={id}>{i > 0 && ', '}<LocLink id={id} /></span>)}</Field>
            <Field label="NPCs">{a.npcIds.map((id) => npcName(id)).filter(Boolean).join(', ') || '—'}</Field>
            <Field label="Climax">{a.climax}</Field>
            {a.spotlight && <Field label="PC spotlight">{a.spotlight}</Field>}
            {a.sideQuests.length > 0 && (
              <Field label="Side quests">
                <ul className="inline-list">
                  {a.sideQuests.map((q) => (
                    <li key={q.id}><strong>{q.title}</strong>: {q.summary} <span className="muted small">(from {npcName(q.giverId) ?? 'a local'}; reward: {q.reward.map((r) => r.name).join(', ')})</span></li>
                  ))}
                </ul>
              </Field>
            )}
            <Field label="Rewards"><Loot items={a.loot} /></Field>
            <h4>Encounters</h4>
            <div className="encounters">
              {a.encounters.map((e) => <EncounterCard key={e.id} e={e} onReroll={() => onChange(rerollEncounter(c, a.id, e.id))} />)}
            </div>
          </article>
        ))}
      </section>

      {/* ---------------- Sessions ---------------- */}
      <section className={`tab-panel ${tab === 'sessions' ? '' : 'tab-hidden'}`}>
        <h2 className="print-only">Sessions</h2>
        <SessionsView c={c} onChange={onChange} goLoc={goLoc} onPlay={(id) => { setPlaySession(id); setTab('play'); window.scrollTo(0, 0); }} />
      </section>

      {/* ---------------- Play ---------------- */}
      {tab === 'play' && (
        <section className="tab-panel no-print">
          <PlayView c={c} onChange={onChange} sessionId={playSession} />
        </section>
      )}

      {/* ---------------- NPCs ---------------- */}
      <section className={`tab-panel ${tab === 'npcs' ? '' : 'tab-hidden'}`}>
        <h2 className="print-only">NPCs</h2>
        <div className="section-actions no-print"><button className="btn" onClick={() => onChange(addNpc(c))}>＋ Add random NPC</button></div>
        <div className="cards">
          {c.npcs.map((n) => (
            <article className="card npc" key={n.id}>
              <div className="card-head">
                <h3>{n.name}</h3>
                <Pill kind={n.attitude}>{n.attitude}</Pill>
                <span className="spacer" />
                <AiButton disabled={aiOff || aiBusy} onClick={() => aiOne('npc', n.id)} />
                <Reroll onClick={() => onChange(rerollNpc(c, n.id))} title="Re-roll NPC" />
                <button className="btn icon ghost no-print" title="Delete NPC" onClick={() => patch((x) => ({ ...x, npcs: x.npcs.filter((m) => m.id !== n.id) }))}>🗑</button>
              </div>
              <div className="with-image">
                <ImageSlot compact imageId={n.imageId} label="portrait" prompt={() => npcPrompt(n, style)} onChange={(id) => setNpc(n.id, { imageId: id })} />
                <div>
                  <div className="muted">{n.species} {n.role}{n.locationId && <> · <LocLink id={n.locationId} /></>}{n.factionId && <> · {facName(n.factionId)}</>}</div>
                  <Field label="Personality">{n.personality}; {n.quirk}</Field>
                  <Field label="Looks">{n.appearance}</Field>
                  <Field label="Wants">{n.want}</Field>
                  <Field label="Secret">{n.secret}</Field>
                </div>
              </div>
              <Editable value={n.description} onSave={(t) => setNpc(n.id, { description: t })} placeholder="✎ add notes" />
            </article>
          ))}
        </div>
      </section>

      {/* ---------------- Factions ---------------- */}
      <section className={`tab-panel ${tab === 'factions' ? '' : 'tab-hidden'}`}>
        <h2 className="print-only">Factions</h2>
        <div className="cards">
          {c.factions.map((f) => (
            <article className="card" key={f.id}>
              <div className="card-head">
                <h3>{f.name}</h3>
                <Pill kind={f.attitude}>{f.attitude}</Pill>
                <span className="spacer" />
                <AiButton disabled={aiOff || aiBusy} onClick={() => aiOne('faction', f.id)} />
                <Reroll onClick={() => onChange(rerollFaction(c, f.id))} title="Re-roll faction" />
              </div>
              <div className="with-image">
                <ImageSlot compact imageId={f.imageId} label="emblem" prompt={() => factionPrompt(f, style)} onChange={(id) => patch((x) => ({ ...x, factions: x.factions.map((y) => (y.id === f.id ? { ...y, imageId: id } : y)) }))} />
                <div>
                  <Field label="Type">{f.kind}</Field>
                  <Field label="Goal">{f.goal}</Field>
                  <Field label="Methods">{f.method}</Field>
                  <Field label="Symbol">{f.symbol}</Field>
                  <Field label="Leader">{npcName(f.leaderId) ?? '—'}</Field>
                  <Field label="Members">{c.npcs.filter((n) => n.factionId === f.id).map((n) => n.name).join(', ') || '—'}</Field>
                </div>
              </div>
              <Editable value={f.description} onSave={(t) => patch((x) => ({ ...x, factions: x.factions.map((y) => (y.id === f.id ? { ...y, description: t } : y)) }))} placeholder="✎ add notes" />
            </article>
          ))}
        </div>
      </section>

      {/* ---------------- Locations ---------------- */}
      <section className={`tab-panel ${tab === 'locations' ? '' : 'tab-hidden'}`}>
        <h2 className="print-only">Locations</h2>
        {c.locations.map((l) => (
          <LocationCard key={l.id} l={l} c={c} focused={focusLoc === l.id} style={style} aiOff={aiOff || aiBusy}
            onAi={() => aiOne('location', l.id)}
            onReroll={() => onChange(rerollLocation(c, l.id))}
            onRerollLayout={() => onChange(l.dungeon ? rerollDungeon(c, l.id) : rerollTown(c, l.id))}
            onPatch={(p) => setLoc(l.id, p)} />
        ))}
      </section>

      {/* ---------------- World map ---------------- */}
      <section className={`tab-panel ${tab === 'maps' ? '' : 'tab-hidden'}`}>
        <h2 className="print-only">World map</h2>
        <div className="card">
          <div className="card-head"><h3>{c.region.name}</h3><span className="muted small">Click a marker to open the location</span></div>
          <RegionMap c={c} onSelect={goLoc} selected={focusLoc} />
          <div className="legend">
            {Object.entries(REGION_LEGEND).map(([k, icon]) => <span key={k}><span className="legend-icon">{icon}</span> {k}</span>)}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Illustrated map (AI)</h3></div>
          <p className="muted small">An artistic rendering to show players. It will <strong>not</strong> match the layout above exactly; image models can't follow precise geography.</p>
          <ImageSlot wide imageId={c.mapImageId} label="illustrated map" prompt={() => regionMapPrompt(c, style)} onChange={(id) => patch((x) => ({ ...x, mapImageId: id }))} />
        </div>
      </section>
    </div>
  );
}

function LocationCard({ l, c, focused, style, aiOff, onAi, onReroll, onRerollLayout, onPatch }: {
  l: Location; c: Campaign; focused: boolean; style: string; aiOff: boolean;
  onAi: () => Promise<void>; onReroll: () => void; onRerollLayout: () => void; onPatch: (p: Partial<Location>) => void;
}) {
  const [showMap, setShowMap] = useState(true);
  const [room, setRoom] = useState<number>();
  const locals = c.npcs.filter((n) => n.locationId === l.id);
  const acts = c.acts.filter((a) => a.locationIds.includes(l.id));
  return (
    <article className={`card location ${focused ? 'focused' : ''}`} id={`loc-${l.id}`}>
      <div className="card-head">
        <h3>{l.name}</h3>
        <Pill kind={l.kind === 'dungeon' ? 'enemy' : undefined}>{l.kind}</Pill>
        <Pill>{l.terrain}</Pill>
        {acts.map((a) => <Pill key={a.id} kind="act">Act {a.number}</Pill>)}
        <span className="spacer" />
        <AiButton disabled={aiOff} onClick={onAi} />
        <Reroll onClick={onReroll} title="Re-roll location" />
      </div>
      <div className="with-image">
        <ImageSlot imageId={l.imageId} label="scene" wide prompt={() => locationPrompt(l, style)} onChange={(id) => onPatch({ imageId: id })} />
        <div>
          <p>{l.summary[0].toUpperCase() + l.summary.slice(1)}.</p>
          <Field label="Notable">{l.features.join(' · ')}</Field>
          {locals.length > 0 && <Field label="People">{locals.map((n) => `${n.name} (${n.role})`).join(', ')}</Field>}
        </div>
      </div>
      <Editable value={l.description} onSave={(t) => onPatch({ description: t })} placeholder="✎ add notes" />

      {(l.town || l.dungeon) && (
        <div className="subsection">
          <div className="card-head">
            <h4>{l.dungeon ? `Dungeon map: ${l.dungeon.theme}, level ${l.dungeon.level}` : 'Town map'}</h4>
            <span className="spacer" />
            <button className="btn small ghost no-print" onClick={() => setShowMap((s) => !s)}>{showMap ? 'Hide' : 'Show'}</button>
            <Reroll onClick={onRerollLayout} title="Re-roll layout" />
          </div>
          {showMap && (
            <>
              {l.town && <TownMap t={l.town} name={l.name} npcs={c.npcs} />}
              {l.dungeon && (
                <>
                  <p className="muted">{l.dungeon.history}</p>
                  <DungeonMap d={l.dungeon} selectedRoom={room} onSelectRoom={setRoom} />
                  <div className="legend small"><span>⚔ encounter</span><span>◆ treasure</span><span>⚠ trap</span><span>▭ door</span><span>● locked</span><span>S secret door</span><span>1 square = 5 ft.</span></div>
                  <ol className="room-key">
                    {l.dungeon.rooms.map((r) => (
                      <li key={r.id} className={room === r.id ? 'on' : ''} onClick={() => setRoom(r.id)}>
                        <strong>{r.id}. {r.name}</strong> <span className="muted">({r.w * 5}×{r.h * 5} ft · exits to {r.exits.join(', ') || '—'})</span>
                        <div>{r.feature[0].toUpperCase() + r.feature.slice(1)}. {r.contents}</div>
                        {r.trap && <div className="small"><em>Trap:</em> {r.trap}</div>}
                        {r.treasure && <div className="small"><em>Treasure:</em> <Loot items={r.treasure} /></div>}
                        {r.encounter && <EncounterCard e={r.encounter} />}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </>
          )}
          <details className="no-print-details">
            <summary>Illustrated map (AI)</summary>
            <p className="muted small">An artistic battle map or town view. It won't match the numbered layout above.</p>
            <ImageSlot wide imageId={l.mapImageId} label="illustrated map" prompt={() => locationMapPrompt(l, style)} onChange={(id) => onPatch({ mapImageId: id })} />
          </details>
        </div>
      )}
    </article>
  );
}
