import { useCallback, useEffect, useRef, useState } from 'react';
import type { Campaign, CampaignOptions, Mood } from './lib/types';
import { generateCampaign, migrate } from './gen/campaign';
import { expandAll, mergeAi, type ExpandCallbacks } from './ai/expand';
import { loadLlm, saveLlm, type LlmSettings } from './ai/llm';
import { loadImageSettings, saveImageSettings, type ImageSettings } from './ai/image';
import { campaignsDb, loadSetting, saveSetting } from './lib/storage';
import { music } from './lib/music';
import { Ctx } from './components/context';
import { DEFAULT_OPTIONS, GenerateForm } from './components/GenerateForm';
import { CampaignView } from './components/CampaignView';
import { Settings } from './components/Settings';
import { Library } from './components/Library';
import { Tools } from './components/Tools';
import { MusicPlayer } from './components/MusicPlayer';

type View = 'generate' | 'campaign' | 'library' | 'tools' | 'settings';
interface Toast { id: number; msg: string; kind: 'error' | 'info' }
interface AiJob { label: string; progress?: string; stream: string; abort: AbortController }

export default function App() {
  const [view, setView] = useState<View>('generate');
  const [campaign, setCampaign] = useState<Campaign>();
  const [saved, setSaved] = useState(false); // current campaign exists in the library
  const [dirty, setDirty] = useState(false);
  const [llm, setLlm] = useState<LlmSettings>(loadLlm);
  const [img, setImg] = useState<ImageSettings>(loadImageSettings);
  const [lastOpts, setLastOpts] = useState<CampaignOptions>(() => loadSetting('last-options', DEFAULT_OPTIONS));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [job, setJob] = useState<AiJob>();
  const [showStream, setShowStream] = useState(true);
  const [mood, setMood] = useState<Mood>();

  const toast = useCallback((msg: string, kind: 'error' | 'info' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 12000 : 4000);
  }, []);

  // ---- AI job runner: one job at a time, live-streamed into a panel ----
  const jobRef = useRef<AiJob | undefined>(undefined);
  const streamBuf = useRef('');
  useEffect(() => {
    if (!job) return;
    const t = setInterval(() => setJob((j) => (j ? { ...j, stream: streamBuf.current.slice(-4000) } : j)), 150);
    return () => clearInterval(t);
  }, [job?.label]); // eslint-disable-line react-hooks/exhaustive-deps

  const runAi = useCallback(async (label: string, fn: (cb: ExpandCallbacks) => Promise<void>) => {
    if (jobRef.current) { toast('Another AI task is still running.', 'error'); return false; }
    const abort = new AbortController();
    streamBuf.current = '';
    const j: AiJob = { label, stream: '', abort };
    jobRef.current = j;
    setJob(j);
    try {
      await fn({
        signal: abort.signal,
        onDelta: (chunk) => { streamBuf.current += chunk; },
        onProgress: (p) => { streamBuf.current += `\n\n— ${p}\n`; setJob((x) => (x ? { ...x, progress: p } : x)); },
      });
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') toast('AI task stopped.', 'info');
      else toast(`AI failed: ${(e as Error).message}`, 'error');
      return false;
    } finally {
      jobRef.current = undefined;
      setJob(undefined);
    }
  }, [toast]);

  const playMood = useCallback((m: Mood) => { music.play(m); setMood(m); }, []);

  // Once a campaign is in the library, keep it saved as it changes.
  const saveTimer = useRef<number>(undefined);
  useEffect(() => {
    if (!campaign || !saved || !dirty) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      campaignsDb.put(campaign).then(() => setDirty(false)).catch((e) => toast(`Autosave failed: ${e.message}`, 'error'));
    }, 600);
  }, [campaign, saved, dirty, toast]);

  const change = useCallback((c: Campaign) => { setCampaign(c); setDirty(true); }, []);

  async function generate(o: CampaignOptions, expand: boolean) {
    setLastOpts(o);
    saveSetting('last-options', o);
    const c = generateCampaign(o);
    setCampaign(c);
    setSaved(false);
    setDirty(false);
    setView('campaign');
    window.scrollTo(0, 0);
    if (expand) {
      let failed: string[] = [];
      const ok = await runAi('Expanding the new campaign', async (cb) => {
        const r = await expandAll(llm, c, { ...cb, onUpdate: (x) => setCampaign((prev) => (prev && prev.id === x.id ? mergeAi(prev, { ...x, aiExpanded: true }) : prev)) });
        failed = r.failed;
        setCampaign((prev) => (prev && prev.id === r.campaign.id ? mergeAi(prev, r.campaign) : prev));
      });
      if (ok && failed.length) toast(`Done. ${failed.length} item(s) got no AI text (${failed.slice(0, 5).join(', ')}…). Use ✨ on them to retry.`, 'error');
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
    <Ctx.Provider value={{ llm, img, toast, runAi, aiBusy: !!job, mood, playMood }}>
      <div className="app">
        <header className="topbar no-print">
          <button className="brand" onClick={() => setView(campaign ? 'campaign' : 'generate')}>🎲 <span>Campaign Forge</span></button>
          <nav>
            <button className={view === 'generate' ? 'on' : ''} onClick={() => setView('generate')}>Generate</button>
            {campaign && <button className={view === 'campaign' ? 'on' : ''} onClick={() => setView('campaign')}>Current</button>}
            <button className={view === 'library' ? 'on' : ''} onClick={() => setView('library')}>Library</button>
            <button className={view === 'tools' ? 'on' : ''} onClick={() => setView('tools')}>Tools</button>
            <button className={view === 'settings' ? 'on' : ''} onClick={() => setView('settings')}>Settings{!llm.enabled && <span className="dot" title="AI not configured" />}</button>
          </nav>
        </header>

        <main>
          {view === 'generate' && <GenerateForm initial={lastOpts} onGenerate={generate} />}
          {view === 'campaign' && campaign && (
            <CampaignView c={campaign} onChange={change} saved={saved && !dirty} onSave={save} onNew={() => setView('generate')} />
          )}
          {view === 'library' && (
            <Library currentId={campaign?.id}
              onOpen={(c) => { setCampaign(migrate(c)); setSaved(true); setDirty(false); setView('campaign'); }}
              onDeleted={(id) => { if (campaign?.id === id) setSaved(false); }} />
          )}
          {view === 'tools' && <Tools c={campaign} />}
          {view === 'settings' && (
            <Settings llm={llm} img={img} onLlm={(s) => { setLlm(s); saveLlm(s); }} onImg={(s) => { setImg(s); saveImageSettings(s); }} />
          )}
        </main>

        {job && (
          <div className="ai-panel no-print" role="status" aria-live="polite">
            <div className="ai-panel-head">
              <span className="spinner small" />
              <strong>{job.label}</strong>
              <span className="muted small ai-progress">{job.progress}</span>
              <span className="spacer" />
              <button className="btn small ghost" onClick={() => setShowStream((v) => !v)}>{showStream ? 'Hide text' : 'Show text'}</button>
              <button className="btn small" onClick={() => job.abort.abort()}>Stop</button>
            </div>
            {showStream && <pre className="ai-stream" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>{job.stream || 'Waiting for the model…'}</pre>}
          </div>
        )}

        <MusicPlayer mood={mood} onMood={playMood} onStop={() => { music.stop(); setMood(undefined); }} />

        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind}`} onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>{t.msg}</div>
          ))}
        </div>
      </div>
    </Ctx.Provider>
  );
}
