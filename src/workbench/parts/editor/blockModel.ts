// ── Block tree model ─────────────────────────────────────────────────────────

export type BlockKind = 'hat' | 'stack' | 'c-if' | 'c-loop' | 'c-try';

export type BlockType =
  | 'clase' | 'main' | 'metodo'
  | 'si' | 'mientras' | 'para' | 'hacer' | 'cambiar'
  | 'intentar'
  | 'imprimir' | 'imprimir_error'
  | 'entero' | 'cadena' | 'booleano' | 'doble' | 'flotante' | 'largo' | 'caracter' | 'var'
  | 'retornar' | 'lanzar'
  | 'raw';

export interface Block {
  id: string;
  kind: BlockKind;
  type: BlockType;
  label: string;
  params: string;
  color: string;
  children: Block[];
  elseChildren: Block[];
}

let _idCounter = 0;
export function makeBlock(
  kind: BlockKind, type: BlockType, label: string, params: string, color: string,
  children: Block[] = [], elseChildren: Block[] = [],
): Block {
  return { id: `blk-${++_idCounter}`, kind, type, label, params, color, children, elseChildren };
}

// ── Code generator ─────────────────────────────────────────────────────────

export function blocksToCode(blocks: Block[], indent = 0): string {
  return blocks.map(b => blockToCode(b, indent)).filter(Boolean).join('\n');
}

function blockToCode(b: Block, indent: number): string {
  const p = '    '.repeat(indent);
  switch (b.type) {
    case 'clase':
      return `${p}clase ${b.params} {\n${blocksToCode(b.children, indent + 1)}\n${p}}`;

    case 'main':
      return `${p}publico estatico vacio principal(cadena[] argumentos) {\n${blocksToCode(b.children, indent + 1)}\n${p}}`;

    case 'metodo':
      return `${p}${b.params} {\n${blocksToCode(b.children, indent + 1)}\n${p}}`;

    case 'si':
      if (b.elseChildren.length > 0) {
        return (
          `${p}si (${b.params}) {\n${blocksToCode(b.children, indent + 1)}\n${p}} sino {\n` +
          `${blocksToCode(b.elseChildren, indent + 1)}\n${p}}`
        );
      }
      return `${p}si (${b.params}) {\n${blocksToCode(b.children, indent + 1)}\n${p}}`;

    case 'mientras':
      return `${p}mientras (${b.params}) {\n${blocksToCode(b.children, indent + 1)}\n${p}}`;

    case 'para':
      return `${p}para (${b.params}) {\n${blocksToCode(b.children, indent + 1)}\n${p}}`;

    case 'hacer':
      return `${p}hacer {\n${blocksToCode(b.children, indent + 1)}\n${p}} mientras (${b.params});`;

    case 'cambiar':
      return `${p}cambiar (${b.params}) {\n${blocksToCode(b.children, indent + 1)}\n${p}}`;

    case 'intentar':
      return (
        `${p}intentar {\n${blocksToCode(b.children, indent + 1)}\n${p}} capturar (${b.params || 'excepcion e'}) {\n` +
        `${blocksToCode(b.elseChildren, indent + 1)}\n${p}}`
      );

    case 'imprimir':
      return `${p}sistema.imprimir(${b.params});`;

    case 'imprimir_error':
      return `${p}sistema.imprimir_error(${b.params});`;

    case 'retornar':
      return `${p}retornar ${b.params};`;

    case 'lanzar':
      return `${p}lanzar nuevo ${b.params};`;

    case 'entero': case 'cadena': case 'booleano': case 'doble':
    case 'flotante': case 'largo': case 'caracter': case 'var':
      return `${p}${b.type} ${b.params};`;

    case 'raw':
      return `${p}${b.params}`;

    default:
      return b.params ? `${p}${b.params};` : '';
  }
}

// ── Category metadata ─────────────────────────────────────────────────────

export const BLOCK_CATEGORIES = [
  {
    id: 'classes',
    label: 'Clases',
    color: '#9966ff',
    blocks: [
      { type: 'clase'  as BlockType, label: 'clase',            params: 'NombreClase', kind: 'hat'    as BlockKind },
      { type: 'main'   as BlockType, label: 'main()',            params: '',            kind: 'hat'    as BlockKind },
      { type: 'metodo' as BlockType, label: 'método',            params: 'publico vacio nombreMetodo()', kind: 'hat' as BlockKind },
      { type: 'retornar' as BlockType, label: 'retornar',        params: 'valor',       kind: 'stack'  as BlockKind },
    ],
  },
  {
    id: 'control',
    label: 'Control',
    color: '#ffab19',
    blocks: [
      { type: 'si'     as BlockType, label: 'si',                params: 'condición',   kind: 'c-if'   as BlockKind },
      { type: 'mientras' as BlockType, label: 'mientras',        params: 'condición',   kind: 'c-loop' as BlockKind },
      { type: 'hacer'   as BlockType, label: 'hacer',            params: 'condición',   kind: 'c-loop' as BlockKind },
      { type: 'para'   as BlockType, label: 'para',              params: 'entero i = 0; i < 10; i++', kind: 'c-loop' as BlockKind },
      { type: 'cambiar' as BlockType, label: 'cambiar',          params: 'variable',    kind: 'c-loop' as BlockKind },
    ],
  },
  {
    id: 'variables',
    label: 'Variables',
    color: '#ff8c1a',
    blocks: [
      { type: 'entero'   as BlockType, label: 'entero',   params: 'nombre = 0',     kind: 'stack' as BlockKind },
      { type: 'cadena'   as BlockType, label: 'cadena',   params: 'nombre = ""',    kind: 'stack' as BlockKind },
      { type: 'booleano' as BlockType, label: 'booleano', params: 'nombre = verdadero', kind: 'stack' as BlockKind },
      { type: 'doble'    as BlockType, label: 'doble',    params: 'nombre = 0.0',   kind: 'stack' as BlockKind },
      { type: 'corto'    as BlockType, label: 'corto',    params: 'nombre = 0',     kind: 'stack' as BlockKind },
      { type: 'var'      as BlockType, label: 'var',      params: 'nombre = valor', kind: 'stack' as BlockKind },
    ],
  },
  {
    id: 'output',
    label: 'Salida',
    color: '#59c059',
    blocks: [
      { type: 'imprimir' as BlockType, label: 'imprimir',       params: '"Hola Mundo"',  kind: 'stack' as BlockKind },
      { type: 'imprimir_error' as BlockType, label: 'imprimir error', params: '"error"',  kind: 'stack' as BlockKind },
    ],
  },
  {
    id: 'exceptions',
    label: 'Excepciones',
    color: '#ff6680',
    blocks: [
      { type: 'intentar' as BlockType, label: 'intentar/capturar', params: 'excepcion e', kind: 'c-try' as BlockKind },
      { type: 'lanzar'   as BlockType, label: 'lanzar',             params: 'excepcion("mensaje")', kind: 'stack' as BlockKind },
    ],
  },
];
