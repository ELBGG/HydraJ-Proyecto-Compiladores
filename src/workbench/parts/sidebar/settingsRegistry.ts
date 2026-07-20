import { LanguageRegistry } from '../../../languages/index.js';
import { STTRegistry } from './sttRegistry.js';

export type SettingValue = string | number | boolean;
export type SettingType = 'boolean' | 'enum' | 'string' | 'number' | 'secret';

export interface SettingOption {
  value: string;
  label: string;
}

export interface SettingDefinition {
  /** Dot-namespaced, VS Code style (e.g. "editor.fontSize") — this is also the exact
   *  key used in the flat settings.json blob (see settingsStore.ts), not a nested path. */
  readonly id: string;
  readonly category: string;
  readonly label: string;
  readonly description: string;
  readonly type: SettingType;
  readonly default: SettingValue;
  /** Only meaningful for type:'enum'. A function, not a static list — options like
   *  "every registered human language" or "every installed prog language" depend on
   *  what's registered/installed at the moment the settings panel renders, which can
   *  change at runtime (installing a language from the marketplace, registering a new
   *  Spanish mapping). */
  readonly enumOptions?: () => SettingOption[];
  readonly min?: number;
  readonly max?: number;
}

function humanLanguageOptions(): SettingOption[] {
  const seen = new Map<string, string>();
  for (const m of LanguageRegistry.getAllMappings()) {
    if (!seen.has(m.id)) seen.set(m.id, m.nativeName);
  }
  return [...seen.entries()].map(([value, label]) => ({ value, label }));
}

function progLanguageOptions(): SettingOption[] {
  const seen = new Set<string>();
  const out: SettingOption[] = [];
  for (const m of LanguageRegistry.getAllMappings()) {
    if (seen.has(m.languageId)) continue;
    seen.add(m.languageId);
    out.push({ value: m.languageId, label: m.languageId.toUpperCase() });
  }
  return out;
}

function sttLanguageOptions(): SettingOption[] {
  return STTRegistry.getAll().map(m => ({ value: m.id, label: m.name }));
}

/**
 * Every user-configurable setting HydraCode currently exposes, grouped by category —
 * the single source of truth SettingsPanel renders from and settingsStore.ts validates
 * defaults against. Adding a new setting is adding one entry here plus wiring whatever
 * actually reads it (see LANGUAGE_MAPPINGS.md-style docs comment at each consumer site);
 * this file itself has zero UI or persistence logic.
 *
 * This intentionally does NOT cover every hardcoded value in the app (e.g. terminal
 * shell path, compiler binary names, marketplace URL) — those live in the main process
 * and would need it to also read settings.json before each use, which is real, separate
 * follow-up work; see CHANGES.md's "Limitaciones conocidas" for this session's scoping.
 */
export const SETTINGS_SCHEMA: SettingDefinition[] = [
  // ── Editor ─────────────────────────────────────────────────────────────────
  {
    id: 'editor.fontSize', category: 'Editor', label: 'Tamaño de fuente',
    description: 'Tamaño de la fuente en el editor de código, en píxeles.',
    type: 'number', default: 13, min: 8, max: 32,
  },
  {
    id: 'editor.fontFamily', category: 'Editor', label: 'Familia de fuente',
    description: 'Fuente monoespaciada usada en el editor.',
    type: 'string', default: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
  },
  {
    id: 'editor.tabSize', category: 'Editor', label: 'Tamaño de tabulación',
    description: 'Número de espacios que representa una tabulación.',
    type: 'number', default: 4, min: 1, max: 8,
  },
  {
    id: 'editor.wordWrap', category: 'Editor', label: 'Ajuste de línea',
    description: 'Si las líneas largas se ajustan al ancho del editor en vez de desplazarse horizontalmente.',
    type: 'enum', default: 'on',
    enumOptions: () => [{ value: 'on', label: 'Activado' }, { value: 'off', label: 'Desactivado' }],
  },
  {
    id: 'editor.minimapEnabled', category: 'Editor', label: 'Minimapa',
    description: 'Muestra una vista miniatura del archivo a la derecha del editor.',
    type: 'boolean', default: false,
  },
  {
    id: 'editor.lineNumbers', category: 'Editor', label: 'Números de línea',
    description: 'Muestra el número de cada línea a la izquierda del editor.',
    type: 'enum', default: 'on',
    enumOptions: () => [{ value: 'on', label: 'Activado' }, { value: 'off', label: 'Desactivado' }],
  },

  // ── Idioma ─────────────────────────────────────────────────────────────────
  {
    id: 'workbench.humanLanguage', category: 'Idioma', label: 'Idioma humano',
    description: 'Idioma en el que escribes el código antes de transpilar.',
    type: 'enum', default: 'es', enumOptions: humanLanguageOptions,
  },
  {
    id: 'workbench.defaultProgLanguage', category: 'Idioma', label: 'Lenguaje de programación predeterminado',
    description: 'Lenguaje que usan los archivos nuevos sin extensión reconocible y las pestañas en blanco.',
    type: 'enum', default: 'java', enumOptions: progLanguageOptions,
  },

  // ── IA ─────────────────────────────────────────────────────────────────────
  {
    id: 'ai.baseUrl', category: 'IA', label: 'URL base',
    description: 'Endpoint compatible con la API de chat completions de OpenAI. Por defecto, el catálogo gratuito de NVIDIA.',
    type: 'string', default: 'https://integrate.api.nvidia.com/v1',
  },
  {
    id: 'ai.model', category: 'IA', label: 'Modelo',
    description: 'Nombre del modelo a usar en las solicitudes de interpretación de voz.',
    type: 'string', default: 'meta/llama-3.3-70b-instruct',
  },
  {
    id: 'ai.apiKey', category: 'IA', label: 'Clave de API',
    description: 'Tu clave personal (gratis en build.nvidia.com, u otro proveedor). Se guarda solo en este equipo.',
    type: 'secret', default: '',
  },

  // ── Voz a texto ────────────────────────────────────────────────────────────
  {
    id: 'stt.language', category: 'Voz a texto', label: 'Idioma de reconocimiento',
    description: 'Modelo de voz a texto (Vosk) a usar al grabar.',
    type: 'enum', default: 'es', enumOptions: sttLanguageOptions,
  },

  // ── Apariencia ─────────────────────────────────────────────────────────────
  {
    id: 'workbench.colorTheme', category: 'Apariencia', label: 'Tema de color',
    description: 'Tema visual del editor y la interfaz.',
    type: 'enum', default: 'dark',
    // Only one real, fully-wired option today — vsCodeLight exists as color DATA in
    // theme.ts but has no corresponding Monaco tokenizer theme, so exposing it here
    // would toggle the workbench chrome light while the code editor stayed dark. Listed
    // honestly as a single choice rather than offering a half-working "Light" option.
    enumOptions: () => [{ value: 'dark', label: 'Oscuro (predeterminado)' }],
  },

  // ── Ejecución ──────────────────────────────────────────────────────────────
  {
    id: 'run.timeoutMs', category: 'Ejecución', label: 'Tiempo límite de ejecución (ms)',
    description: 'Tiempo máximo que puede correr un programa antes de detenerse automáticamente.',
    type: 'number', default: 30000, min: 1000, max: 300000,
  },
];

export function getSettingDefinition(id: string): SettingDefinition | undefined {
  return SETTINGS_SCHEMA.find(s => s.id === id);
}
