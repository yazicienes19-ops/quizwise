import { ALLOWED_API_MODELS, type ModelConfig } from '../benchmark.config.ts';
import { anthropicAdapter } from './anthropic.ts';
import { geminiAdapter } from './gemini.ts';
import type { ModelAdapter } from './types.ts';

export const adapterFor = (m: ModelConfig): ModelAdapter => {
  if (!ALLOWED_API_MODELS.includes(m.apiModel)) throw new Error(`Modell ${m.apiModel} ist nicht erlaubt (nur ${ALLOWED_API_MODELS.join(', ')}).`);
  return m.provider === 'gemini' ? geminiAdapter : anthropicAdapter;
};
