import { createContext, useContext } from 'react';
import type { LlmSettings } from '../ai/llm';
import type { ImageSettings } from '../ai/image';

export interface AppCtx {
  llm: LlmSettings;
  img: ImageSettings;
  toast: (msg: string, kind?: 'error' | 'info') => void;
}

export const Ctx = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(Ctx);
