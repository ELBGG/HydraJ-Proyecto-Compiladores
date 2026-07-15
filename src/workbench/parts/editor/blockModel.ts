// ── Block tree model ─────────────────────────────────────────────────────────

export type BlockKind = 'hat' | 'stack' | 'c-if' | 'c-loop' | 'c-try';

export type BlockType =
  | 'clase' | 'main' | 'metodo'
  | 'si' | 'mientras' | 'para' | 'hacer' | 'cambiar'
  | 'intentar'
  | 'imprimir' | 'imprimir_error'
  | 'entero' | 'cadena' | 'booleano' | 'doble' | 'flotante' | 'largo' | 'caracter' | 'corto' | 'var'
  | 'retornar' | 'lanzar' | 'romper' | 'continuar'
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
