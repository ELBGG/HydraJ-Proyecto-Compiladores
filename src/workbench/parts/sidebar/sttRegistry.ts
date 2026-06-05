export interface STTLanguageModel {
  id: string;
  name: string;
  url: string;
}

const _models: STTLanguageModel[] = [];

export const STTRegistry = {
  register(model: STTLanguageModel): void {
    if (!_models.find(m => m.id === model.id)) _models.push(model);
  },
  getAll(): STTLanguageModel[] { return [..._models]; },
  get(id: string): STTLanguageModel | undefined { return _models.find(m => m.id === id); },
};

// ── Default models ────────────────────────────────────────────────────────────
STTRegistry.register({
  id: 'es',
  name: 'Español',
  url: 'https://alphacephei.com/vosk/models/vosk-model-small-es-0.42.zip',
});
