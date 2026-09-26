import { createContext, useContext } from 'react';
import type { LlmSettings } from '../ai/llm';
import type { ImageSettings } from '../ai/image';
import type { ExpandCallbacks } from '../ai/expand';
import type { Mood } from '../lib/types';

export interface AppCtx {
  llm: LlmSettings;
  img: ImageSettings;
  toast: (msg: string, kind?: 'error' | 'info') => void;
  /** Run an AI job with the shared live-stream panel. Resolves false if it failed or was stopped. */
  runAi: (label: string, job: (cb: ExpandCallbacks) => Promise<void>) => Promise<boolean>;
  aiBusy: boolean;
  mood?: Mood;
  playMood: (m: Mood) => void;
}

export const Ctx = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(Ctx);
