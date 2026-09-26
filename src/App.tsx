import { useCallback, useEffect, useRef, useState } from 'react';
import type { Campaign, CampaignOptions } from './lib/types';
import { generateCampaign } from './gen/campaign';
import { expandSection, SECTIONS } from './ai/expand';
import { loadLlm, saveLlm, type LlmSettings } from './ai/llm';
import { loadImageSettings, saveImageSettings, type ImageSettings } from './ai/image';
import { campaignsDb, loadSetting, saveSetting } from './lib/storage';
import { Ctx } from './components/context';
import { DEFAULT_OPTIONS, GenerateForm } from './components/GenerateForm';
import { CampaignView } from './components/CampaignView';
import { Settings } from './components/Settings';
import { Library } from './components/Library';

type View = 'generate' | 'campaign' | 'library' | 'settings';
interface Toast { id: number; msg: string; kind: 'error' | 'info' }

export default function App() {
  const [view, setView] = useState<View>('generate');
  const [campaign, setCampaign] = useState<Campaign>();
  const [saved, setSaved] = useState(false); // current campaign exists in the library
  const [dirty, setDirty] = useState(false);
  const [llm, setLlm] = useState<LlmSettings>(loadLlm);
  const [img, setImg] = useState<ImageSettings>(loadImageSettings);
  const [lastOpts, setLastOpts] = useState<CampaignOptions>(() => loadSetting('last-options', DEFAULT_OPTIONS));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState<string>();

  const toast = useCallback((msg: string, kind: 'error' | 'info' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 10000 : 4000);
  }, []);

  // Once a campaign is in the library, keep it saved as it changes.
  const saveTimer = useRef<number>(undefined);
  useEffect(() => {
    if (!campaign || !saved || !dirty) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      campaignsDb.put(campaign).then(() => setDirty(false)).catch((e) => toast(`Autosave failed: ${e.message}`, 'error'));
    }, 600);
  }, [campaign, saved, dirty, toast]);

  const change = (c: Campaign) => { setCampaign(c); setDirty(true); };

  async function generate(o: CampaignOptions, expand: boolean) {
    setLastOpts(o);
    saveSetting('last-options', o);
    let c = generateCampaign(o);
    setCampaign(c);
    setSaved(false);
    setDirty(false);
    setView('campaign');
    window.scrollTo(0, 0);
    if (expand) {
      try {
        for (let i = 0; i < SECTIONS.length; i++) {
          setBusy(`AI is writing ${SECTIONS[i]} (${i + 1}/${SECTIONS.length})…`);
          c = await expandSection(llm, c, SECTIONS[i]);
          setCampaign({ ...c, aiExpanded: true });
        }
      } catch (e) {
        toast(`AI expansion stopped: ${(e as Error).message}. The table-generated campaign is still usable.`, 'error');
      } finally {
        setBusy(undefined);
      }
    }
  }

  async function save() {
    if (!campaign) return;
    try {
      await campaignsDb.put(campaign);
      setSaved(true);
      setDirty(false);
      toast('Saved to your library.', 'info');
    } catch (e) {
      toast(`Save failed: ${(e as Error).message}`, 'error');
    }
  }

  return (
    <Ctx.Provider value={{ llm, img, toast }}>
      <div className="app">
        <header className="topbar no-print">
          <button className="brand" onClick={() => setView(campaign ? 'campaign' : 'generate')}>🎲 <span>Campaign Forge</span></button>
          <nav>
            <button className={view === 'generate' ? 'on' : ''} onClick={() => setView('generate')}>Generate</button>
            {campaign && <button className={view === 'campaign' ? 'on' : ''} onClick={() => setView('campaign')}>Current</button>}
            <button className={view === 'library' ? 'on' : ''} onClick={() => setView('library')}>Library</button>
            <button className={view === 'settings' ? 'on' : ''} onClick={() => setView('settings')}>Settings{!llm.enabled && <span className="dot" title="AI not configured" />}</button>
          </nav>
        </header>

        {busy && <div className="busy-bar no-print"><span className="spinner small" /> {busy}</div>}

        <main>
          {view === 'generate' && <GenerateForm initial={lastOpts} onGenerate={generate} />}
          {view === 'campaign' && campaign && (
            <CampaignView c={campaign} onChange={change} saved={saved && !dirty} onSave={save} onNew={() => setView('generate')} />
          )}
          {view === 'library' && (
            <Library currentId={campaign?.id}
              onOpen={(c) => { setCampaign(c); setSaved(true); setDirty(false); setView('campaign'); }}
              onDeleted={(id) => { if (campaign?.id === id) setSaved(false); }} />
          )}
          {view === 'settings' && (
            <Settings llm={llm} img={img} onLlm={(s) => { setLlm(s); saveLlm(s); }} onImg={(s) => { setImg(s); saveImageSettings(s); }} />
          )}
        </main>

        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind}`} onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>{t.msg}</div>
          ))}
        </div>
      </div>
    </Ctx.Provider>
  );
}
