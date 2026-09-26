// Text-to-speech with the browser's built-in speechSynthesis: free, offline, no keys.
// Each speaker gets a stable voice + pitch; long texts are split into sentences
// (Chrome stops speaking utterances longer than ~15 s).

export interface VoicePrefs { voiceURI?: string; pitch: number; rate: number }

class VoiceEngine {
  enabled = false;
  rate = 1;
  volume = 1;
  private queue: { text: string; who: string }[] = [];
  private speaking = false;
  private assignments = new Map<string, VoicePrefs>();
  private idleWaiters: (() => void)[] = [];

  get supported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  voices(): SpeechSynthesisVoice[] {
    if (!this.supported) return [];
    const all = speechSynthesis.getVoices();
    const en = all.filter((v) => /^en/i.test(v.lang));
    return en.length ? en : all;
  }

  /** Stable default voice per speaker: DM deep and slow, players spread across available voices. */
  prefsFor(who: string, index = 0): VoicePrefs {
    const set = this.assignments.get(who);
    if (set) return set;
    const vs = this.voices();
    const isDm = who === 'DM';
    let h = 0;
    for (const ch of who) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const v = vs.length ? vs[(isDm ? 0 : 1 + ((h + index) % Math.max(1, vs.length - 1))) % vs.length] : undefined;
    const prefs: VoicePrefs = { voiceURI: v?.voiceURI, pitch: isDm ? 0.85 : 0.8 + ((h % 7) / 10), rate: isDm ? 0.95 : 1.05 };
    this.assignments.set(who, prefs);
    return prefs;
  }

  setPrefs(who: string, p: VoicePrefs) {
    this.assignments.set(who, p);
  }

  speak(who: string, text: string) {
    if (!this.enabled || !this.supported || !text.trim()) return;
    const clean = text.replace(/\[[^\]]*\]/g, '').replace(/[*_#>`]/g, '').replace(/\s+/g, ' ').trim();
    const sentences = clean.match(/[^.!?…]+[.!?…]*["”']?\s*/g) ?? [clean];
    let chunk = '';
    for (const s of sentences) {
      if ((chunk + s).length > 220 && chunk) { this.queue.push({ text: chunk, who }); chunk = ''; }
      chunk += s;
    }
    if (chunk.trim()) this.queue.push({ text: chunk, who });
    this.pump();
  }

  private pump() {
    if (this.speaking || !this.queue.length) {
      if (!this.speaking && !this.queue.length) this.flushIdle();
      return;
    }
    const { text, who } = this.queue.shift()!;
    const p = this.prefsFor(who);
    const u = new SpeechSynthesisUtterance(text);
    const v = this.voices().find((x) => x.voiceURI === p.voiceURI);
    if (v) u.voice = v;
    u.pitch = p.pitch;
    u.rate = p.rate * this.rate;
    u.volume = this.volume;
    this.speaking = true;
    let finished = false;
    // Watchdog: some browsers occasionally never fire onend; don't let the table stall.
    const watchdog = setTimeout(() => done(), (text.length * 90) / Math.max(0.5, u.rate) + 4000);
    const done = () => { if (finished) return; finished = true; clearTimeout(watchdog); this.speaking = false; this.pump(); };
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
  }

  private flushIdle() {
    const w = this.idleWaiters;
    this.idleWaiters = [];
    w.forEach((f) => f());
  }

  /** Resolves when everything queued has been spoken (or immediately if voice is off). */
  waitIdle(signal?: AbortSignal): Promise<void> {
    if (!this.enabled || (!this.speaking && !this.queue.length)) return Promise.resolve();
    return new Promise((resolve) => {
      this.idleWaiters.push(resolve);
      signal?.addEventListener('abort', () => resolve(), { once: true });
    });
  }

  stop() {
    this.queue = [];
    if (this.supported) speechSynthesis.cancel();
    this.speaking = false;
    this.flushIdle();
  }
}

export const voice = new VoiceEngine();
