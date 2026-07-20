import * as Blockly from 'blockly/core';

/* ───────────────────────────────────────────────────────────────────────────
   Block Definitions (JSON)
   ─────────────────────────────────────────────────────────────────────────── */

export const BLOCK_DEFS = [
  // ── Hat blocks (no previousStatement) ──────────────────────────────────
  {
    type: 'hc_clase',
    message0: 'clase %1',
    args0: [{ type: 'field_input', name: 'NAME', text: 'MiClase' }],
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'BODY' }],
    nextStatement: null,
    colour: 260,
    tooltip: 'Define una clase',
  },
  {
    type: 'hc_main',
    message0: 'main()',
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'BODY' }],
    nextStatement: null,
    colour: 30,
    tooltip: 'Método principal',
  },
  {
    type: 'hc_metodo',
    message0: '%1',
    args0: [{ type: 'field_input', name: 'SIGNATURE', text: 'publico vacio nombre()' }],
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'BODY' }],
    nextStatement: null,
    colour: 260,
    tooltip: 'Define un método',
  },
  // ── C-blocks (previous + next + statement inputs) ─────────────────────
  {
    type: 'hc_si',
    message0: 'si %1',
    args0: [{ type: 'field_input', name: 'COND', text: 'condición' }],
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'DO' }],
    message2: 'sino %1',
    args2: [{ type: 'input_statement', name: 'ELSE' }],
    previousStatement: null,
    nextStatement: null,
    colour: 35,
    tooltip: 'Si / Sino',
  },
  {
    type: 'hc_mientras',
    message0: 'mientras %1',
    args0: [{ type: 'field_input', name: 'COND', text: 'condición' }],
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'DO' }],
    previousStatement: null,
    nextStatement: null,
    colour: 35,
    tooltip: 'Bucle mientras',
  },
  {
    type: 'hc_hacer',
    message0: 'hacer',
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'DO' }],
    message2: 'mientras (%1)',
    args2: [{ type: 'field_input', name: 'COND', text: 'condición' }],
    previousStatement: null,
    nextStatement: null,
    colour: 35,
    tooltip: 'Bucle hacer / mientras',
  },
  {
    type: 'hc_para',
    message0: 'para %1',
    args0: [{ type: 'field_input', name: 'INIT', text: 'entero i = 0; i < 10; i++' }],
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'DO' }],
    previousStatement: null,
    nextStatement: null,
    colour: 35,
    tooltip: 'Bucle para',
  },
  {
    type: 'hc_cambiar',
    message0: 'cambiar %1',
    args0: [{ type: 'field_input', name: 'VAR', text: 'variable' }],
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'DO' }],
    previousStatement: null,
    nextStatement: null,
    colour: 35,
    tooltip: 'Cambiar / Caso',
  },
  {
    type: 'hc_intentar',
    message0: 'intentar',
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'DO' }],
    message2: 'capturar (%1)',
    args2: [{ type: 'field_input', name: 'EXC', text: 'excepcion e' }],
    message3: '%1',
    args3: [{ type: 'input_statement', name: 'CATCH' }],
    previousStatement: null,
    nextStatement: null,
    colour: 350,
    tooltip: 'Intentar / Capturar',
  },
  // ── Stack blocks (previous + next) ────────────────────────────────────
  {
    type: 'hc_imprimir',
    message0: 'imprimir %1',
    args0: [{ type: 'field_input', name: 'TEXT', text: '"Hola Mundo"' }],
    previousStatement: null,
    nextStatement: null,
    colour: 120,
    tooltip: 'Imprimir en consola',
  },
  {
    type: 'hc_imprimir_error',
    message0: 'imprimir error %1',
    args0: [{ type: 'field_input', name: 'TEXT', text: '"error"' }],
    previousStatement: null,
    nextStatement: null,
    colour: 120,
    tooltip: 'Imprimir en salida de error',
  },
  {
    type: 'hc_entero',
    message0: 'entero %1',
    args0: [{ type: 'field_input', name: 'VAR', text: 'nombre = 0' }],
    previousStatement: null,
    nextStatement: null,
    colour: 230,
    tooltip: 'Variable entera',
  },
  {
    type: 'hc_cadena',
    message0: 'cadena %1',
    args0: [{ type: 'field_input', name: 'VAR', text: 'nombre = ""' }],
    previousStatement: null,
    nextStatement: null,
    colour: 230,
    tooltip: 'Variable cadena',
  },
  {
    type: 'hc_booleano',
    message0: 'booleano %1',
    args0: [{ type: 'field_input', name: 'VAR', text: 'nombre = verdadero' }],
    previousStatement: null,
    nextStatement: null,
    colour: 230,
    tooltip: 'Variable booleana',
  },
  {
    type: 'hc_doble',
    message0: 'doble %1',
    args0: [{ type: 'field_input', name: 'VAR', text: 'nombre = 0.0' }],
    previousStatement: null,
    nextStatement: null,
    colour: 230,
    tooltip: 'Variable doble',
  },
  {
    type: 'hc_flotante',
    message0: 'flotante %1',
    args0: [{ type: 'field_input', name: 'VAR', text: 'nombre = 0.0f' }],
    previousStatement: null,
    nextStatement: null,
    colour: 230,
  },
  {
    type: 'hc_largo',
    message0: 'largo %1',
    args0: [{ type: 'field_input', name: 'VAR', text: 'nombre = 0L' }],
    previousStatement: null,
    nextStatement: null,
    colour: 230,
  },
  {
    type: 'hc_caracter',
    message0: 'caracter %1',
    args0: [{ type: 'field_input', name: 'VAR', text: 'nombre = \'a\'' }],
    previousStatement: null,
    nextStatement: null,
    colour: 230,
  },
  {
    type: 'hc_corto',
    message0: 'corto %1',
    args0: [{ type: 'field_input', name: 'VAR', text: 'nombre = 0' }],
    previousStatement: null,
    nextStatement: null,
    colour: 230,
    tooltip: 'Variable entera corta',
  },
  {
    type: 'hc_var',
    message0: 'var %1',
    args0: [{ type: 'field_input', name: 'VAR', text: 'nombre = valor' }],
    previousStatement: null,
    nextStatement: null,
    colour: 230,
    tooltip: 'Variable con tipo inferido',
  },
  {
    type: 'hc_retornar',
    message0: 'retornar %1',
    args0: [{ type: 'field_input', name: 'VALUE', text: 'valor' }],
    previousStatement: null,
    nextStatement: null,
    colour: 260,
    tooltip: 'Retornar un valor',
  },
  {
    type: 'hc_lanzar',
    message0: 'lanzar %1',
    args0: [{ type: 'field_input', name: 'EXC', text: 'nueva Excepcion("msg")' }],
    previousStatement: null,
    nextStatement: null,
    colour: 350,
    tooltip: 'Lanzar una excepción',
  },
  {
    type: 'hc_romper',
    message0: 'romper',
    previousStatement: null,
    nextStatement: null,
    colour: 35,
    tooltip: 'Sale del bucle o del cambiar actual',
  },
  {
    type: 'hc_continuar',
    message0: 'continuar',
    previousStatement: null,
    nextStatement: null,
    colour: 35,
    tooltip: 'Salta a la siguiente iteración del bucle',
  },
];

// Blockly.defineBlocksWithJsonArray() logs a console warning per block type ("X
// overwrites previous definition") if called more than once — harmless (Blockly
// explicitly supports redefinition), but BlocklySession.create() runs on every entry
// into Blocks mode, so a session with a few visits produced dozens of repeated
// warnings for the exact same, unchanged definitions. Registering once for the whole
// app lifetime removes the noise without changing behavior.
let _blockDefsRegistered = false;
function ensureBlockDefsRegistered(): void {
  if (_blockDefsRegistered) return;
  Blockly.defineBlocksWithJsonArray(BLOCK_DEFS);
  _blockDefsRegistered = true;
}

/* ───────────────────────────────────────────────────────────────────────────
   Toolbox XML
   ─────────────────────────────────────────────────────────────────────────── */

const TOOLBOX_XML = `
<xml>
  <category name="Clases" colour="260">
    <block type="hc_clase"/>
    <block type="hc_main"/>
    <block type="hc_metodo"/>
    <block type="hc_retornar"/>
  </category>
  <category name="Control" colour="35">
    <block type="hc_si"/>
    <block type="hc_mientras"/>
    <block type="hc_hacer"/>
    <block type="hc_para"/>
    <block type="hc_cambiar"/>
    <block type="hc_romper"/>
    <block type="hc_continuar"/>
  </category>
  <category name="Variables" colour="230">
    <block type="hc_entero"/>
    <block type="hc_cadena"/>
    <block type="hc_booleano"/>
    <block type="hc_doble"/>
    <block type="hc_flotante"/>
    <block type="hc_largo"/>
    <block type="hc_corto"/>
    <block type="hc_caracter"/>
    <block type="hc_var"/>
  </category>
  <category name="Salida" colour="120">
    <block type="hc_imprimir"/>
    <block type="hc_imprimir_error"/>
  </category>
  <category name="Excepciones" colour="350">
    <block type="hc_intentar"/>
    <block type="hc_lanzar"/>
  </category>
</xml>`;

/* ───────────────────────────────────────────────────────────────────────────
   Dark Theme (HydraCode)
   ─────────────────────────────────────────────────────────────────────────── */

const HYDRACODE_THEME = Blockly.Theme.defineTheme('hydracode-dark', {
  name: 'hydracode-dark',
  base: Blockly.Themes.Classic,
  fontStyle: {
    family: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
    weight: 'bold',
    size: 12,
  },
  startHats: false,
  categoryStyles: {
    category_style_clases: { colour: '#9966ff' },
    category_style_control: { colour: '#ffab19' },
    category_style_variables: { colour: '#ff8c1a' },
    category_style_salida: { colour: '#59c059' },
    category_style_excepciones: { colour: '#ff6680' },
  },
  componentStyles: {
    toolboxBackgroundColour: '#1a1a30',
    toolboxForegroundColour: '#c8c8e8',
    flyoutBackgroundColour: '#16162a',
    flyoutForegroundColour: '#c8c8e8',
    flyoutOpacity: 0.95,
    scrollbarColour: '#3a3a5c',
    scrollbarOpacity: 0.5,
    insertionMarkerColour: '#7c7cff',
    insertionMarkerOpacity: 0.3,
    workspaceBackgroundColour: '#1e1e2e',
  },
});

/* ───────────────────────────────────────────────────────────────────────────
   Code Generators — one generic engine, driven by each mapping's blockTemplate
   ─────────────────────────────────────────────────────────────────────────── */

import { LanguageRegistry } from '../../../languages/index.js';
import { buildGenericGenerator, finalizeGeneratedCode } from './blocklyGenerators/genericGenerator.js';
import type { IHydraCodeGenerator } from './blocklyGenerators/genericGenerator.js';

const generatorCache = new Map<string, IHydraCodeGenerator | null>();

/** Looks up (or lazily builds + caches) the Blockly code generator for a prog
 *  language + human language pair, reading its vocabulary and blockTemplate
 *  straight from LanguageRegistry — no per-language TypeScript file involved.
 *
 *  Returns null when there is no registered mapping for the pair, or the mapping
 *  exists but declares no blockTemplate. Callers MUST treat null as "Blocks mode
 *  unavailable for this language" (see isBlocksModeSupported below) rather than
 *  substituting a different language's generator — silently emitting, say, Java
 *  syntax into a Go file would be worse than not offering the feature at all. */
function generatorFor(progLang: string, humanLang: string): IHydraCodeGenerator | null {
  const key = `${progLang}::${humanLang}`;
  const cached = generatorCache.get(key);
  if (cached !== undefined) return cached;
  const mapping = LanguageRegistry.getMapping(progLang, humanLang);
  const gen = mapping ? buildGenericGenerator(mapping) : null;
  generatorCache.set(key, gen);
  return gen;
}

/** Whether Blocks mode can generate code for this prog+human language pair right
 *  now. UI should check this before switching into Blocks mode and refuse (like
 *  the existing "code too complex to parse" guard) rather than opening an empty
 *  or non-functional canvas. */
export function isBlocksModeSupported(progLang: string, humanLang: string): boolean {
  return generatorFor(progLang, humanLang) !== null;
}

/* ───────────────────────────────────────────────────────────────────────────
   Block Model Converter (Block[] → Blockly XML)
   ─────────────────────────────────────────────────────────────────────────── */

import type { Block } from './blockModel.js';

const BLOCK_TYPE_MAP: Record<string, string> = {
  clase: 'hc_clase', main: 'hc_main', metodo: 'hc_metodo',
  si: 'hc_si', mientras: 'hc_mientras', hacer: 'hc_hacer',
  para: 'hc_para', cambiar: 'hc_cambiar',
  intentar: 'hc_intentar',
  imprimir: 'hc_imprimir', imprimir_error: 'hc_imprimir_error',
  entero: 'hc_entero', cadena: 'hc_cadena', booleano: 'hc_booleano',
  doble: 'hc_doble', flotante: 'hc_flotante', largo: 'hc_largo',
  corto: 'hc_corto', caracter: 'hc_caracter', var: 'hc_var',
  retornar: 'hc_retornar', lanzar: 'hc_lanzar',
  romper: 'hc_romper', continuar: 'hc_continuar',
};

function blockTypeFieldName(blocklyType: string): string | null {
  const map: Record<string, string> = {
    hc_clase: 'NAME', hc_metodo: 'SIGNATURE',
    hc_si: 'COND', hc_mientras: 'COND', hc_hacer: 'COND',
    hc_para: 'INIT', hc_cambiar: 'VAR',
    hc_intentar: 'EXC',
    hc_imprimir: 'TEXT', hc_imprimir_error: 'TEXT',
    hc_entero: 'VAR', hc_cadena: 'VAR', hc_booleano: 'VAR',
    hc_doble: 'VAR', hc_flotante: 'VAR', hc_largo: 'VAR',
    hc_corto: 'VAR', hc_caracter: 'VAR', hc_var: 'VAR',
    hc_retornar: 'VALUE', hc_lanzar: 'EXC',
  };
  return map[blocklyType] ?? null;
}

function statementName(blocklyType: string): string | null {
  const map: Record<string, string> = {
    hc_clase: 'BODY', hc_main: 'BODY', hc_metodo: 'BODY',
    hc_si: 'DO', hc_mientras: 'DO', hc_hacer: 'DO',
    hc_para: 'DO', hc_cambiar: 'DO',
    hc_intentar: 'DO',
  };
  return map[blocklyType] ?? null;
}

function elseStatementName(blocklyType: string): string | null {
  const map: Record<string, string> = {
    hc_si: 'ELSE', hc_intentar: 'CATCH',
  };
  return map[blocklyType] ?? null;
}

function blockToXml(b: Block, doc: Document): Element | null {
  const blkType = BLOCK_TYPE_MAP[b.type];
  if (!blkType) return null;

  const blockEl = doc.createElement('block');
  blockEl.setAttribute('type', blkType);

  // Set field value
  if (blkType !== 'hc_main') {
    const fieldName = blockTypeFieldName(blkType);
    if (fieldName && b.params) {
      const fieldEl = doc.createElement('field');
      fieldEl.setAttribute('name', fieldName);
      fieldEl.textContent = b.params;
      blockEl.appendChild(fieldEl);
    }
  }

  // Statement: main children body
  const stName = statementName(blkType);
  if (stName && b.children.length > 0) {
    const stEl = doc.createElement('statement');
    stEl.setAttribute('name', stName);
    const childXml = blocksToXml(b.children, doc);
    if (childXml) stEl.appendChild(childXml);
    blockEl.appendChild(stEl);
  }

  // Else/catch statement
  const elseSt = elseStatementName(blkType);
  if (elseSt && b.elseChildren.length > 0) {
    const stEl = doc.createElement('statement');
    stEl.setAttribute('name', elseSt);
    const childXml = blocksToXml(b.elseChildren, doc);
    if (childXml) stEl.appendChild(childXml);
    blockEl.appendChild(stEl);
  }

  return blockEl;
}

/** Convert a Block[] array into a chained Blockly XML `<block>` element */
function blocksToXml(blocks: Block[], doc: Document): Element | null {
  if (blocks.length === 0) return null;

  let first: Element | null = null;
  let prev: Element | null = null;

  for (const b of blocks) {
    const el = blockToXml(b, doc);
    if (!el) continue;

    // Stack blocks chain via <next>
    if (prev) {
      const nextEl = doc.createElement('next');
      nextEl.appendChild(el);
      prev.appendChild(nextEl);
    } else {
      first = el;
    }
    prev = el;
  }

  return first;
}

/* ───────────────────────────────────────────────────────────────────────────
   BlocklySession — manages a Blockly workspace lifecycle
   ─────────────────────────────────────────────────────────────────────────── */

export class BlocklySession {
  private workspace: Blockly.WorkspaceSvg | null = null;
  private changeListeners: Set<() => void> = new Set();
  private _initialized = false;
  private _progLang = 'java';
  private _humanLang = 'es';

  get isActive(): boolean {
    return this.workspace !== null;
  }

  /** Which language getCode() generates for — must be set before/at create() to match
   *  whatever prog+human language pair the tab being edited actually uses. The actual
   *  generator is resolved from LanguageRegistry's blockTemplate for that pair (see
   *  blocklyGenerators/genericGenerator.ts) — there is no fixed list of languages here. */
  setLanguage(progLang: string, humanLang: string): void {
    this._progLang = progLang;
    this._humanLang = humanLang;
  }

  /** Whether the currently-set language pair can actually generate code. */
  supportsCurrentLanguage(): boolean {
    return isBlocksModeSupported(this._progLang, this._humanLang);
  }

  create(container: HTMLElement, progLang?: string, humanLang?: string): void {
    if (this.workspace) this.dispose();
    if (progLang) this._progLang = progLang;
    if (humanLang) this._humanLang = humanLang;

    ensureBlockDefsRegistered();

    this.workspace = Blockly.inject(container, {
      toolbox: TOOLBOX_XML,
      theme: HYDRACODE_THEME,
      renderer: 'thrasos',
      zoom: {
        controls: true,
        wheel: true,
        startScale: 0.9,
        maxScale: 2,
        minScale: 0.3,
        scaleSpeed: 1.1,
      },
      trashcan: true,
      move: {
        scrollbars: true,
        drag: true,
        wheel: true,
      },
      grid: {
        spacing: 20,
        length: 2,
        colour: '#2a2a4a',
        snap: false,
      },
    });

    this.workspace.addChangeListener(() => {
      for (const cb of this.changeListeners) cb();
    });

    this._initialized = true;
  }

  dispose(): void {
    if (this.workspace) {
      this.workspace.dispose();
      this.workspace = null;
    }
    this._initialized = false;
  }

  onChange(callback: () => void): void {
    this.changeListeners.add(callback);
  }

  removeChangeListener(callback: () => void): void {
    this.changeListeners.delete(callback);
  }

  /** Add a block by type name at a default position */
  addBlock(type: string): Blockly.BlockSvg | null {
    if (!this.workspace) return null;
    const block = this.workspace.newBlock(type);
    block.initSvg();
    block.render();
    // Position near center-top of visible area
    const metrics = this.workspace.getMetrics();
    if (metrics) {
      const x = metrics.viewLeft + 40 + Math.random() * 60;
      const y = metrics.viewTop + 40 + Math.random() * 40;
      block.moveBy(x, y);
    }
    return block;
  }

  /** Generate Spanish-keyword source for whichever prog+human language pair is
   *  active (see setLanguage()) from the workspace. Returns null if that pair has
   *  no blockTemplate-bearing mapping — callers must handle this explicitly (e.g.
   *  by keeping the tab's last-saved text content) instead of writing out code
   *  from the wrong language's generator. */
  getCode(): string | null {
    if (!this.workspace) return '';

    const gen = generatorFor(this._progLang, this._humanLang);
    if (!gen) return null;

    const topBlocks = this.workspace.getTopBlocks(true);
    if (topBlocks.length === 0) return '';

    let code = '';
    for (const block of topBlocks) {
      const blockCode = gen.blockToCode(block);
      if (blockCode !== null) {
        code += blockCode as string;
      }
    }

    const template = LanguageRegistry.getMapping(this._progLang, this._humanLang)?.blockTemplate;
    return template ? finalizeGeneratedCode(code, gen, template) : code;
  }

  /** Load blocks from our Block[] model into the workspace */
  loadBlocks(blocks: Block[]): void {
    if (!this.workspace) return;
    this.workspace.clear();
    if (blocks.length === 0) return;

    const doc = document.implementation.createDocument(null, null, null);
    const xmlEl = doc.createElement('xml');

    // Each top-level block is an independent workspace block — do NOT chain
    // them with <next>. Give each one an x/y position so they don't overlap.
    let x = 40;
    for (const b of blocks) {
      const el = blockToXml(b, doc);
      if (!el) continue;
      el.setAttribute('x', String(x));
      el.setAttribute('y', '40');
      xmlEl.appendChild(el);
      x += 340;
    }

    if (!xmlEl.hasChildNodes()) return;

    Blockly.Events.disable();
    try {
      Blockly.Xml.domToWorkspace(xmlEl, this.workspace);
      this.workspace.resizeContents();
    } finally {
      Blockly.Events.enable();
    }
  }

  /** Clear all blocks from the workspace */
  clear(): void {
    if (!this.workspace) return;
    this.workspace.clear();
  }

  /** Get workspace XML for serialization */
  getXml(): string {
    if (!this.workspace) return '<xml></xml>';
    const dom = Blockly.Xml.workspaceToDom(this.workspace);
    return Blockly.Xml.domToText(dom);
  }

  /** Load workspace from XML */
  setXml(xml: string): void {
    if (!this.workspace) return;
    this.workspace.clear();
    try {
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      Blockly.Xml.domToWorkspace(doc.documentElement, this.workspace);
    } catch (e) {
      console.error('Failed to load Blockly XML:', e);
    }
  }

  resize(): void {
    Blockly.svgResize(this.workspace as Blockly.WorkspaceSvg);
  }
}
