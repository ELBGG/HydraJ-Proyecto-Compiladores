import { LanguageTokens } from '../tokens/LanguageTokens.js';

export const cTokens = new LanguageTokens('c', 'C', {
  keywords: [
    'auto', 'break', 'case', 'const', 'continue', 'default', 'do',
    'else', 'enum', 'extern', 'for', 'goto', 'if', 'register',
    'return', 'signed', 'sizeof', 'static', 'struct', 'switch',
    'typedef', 'union', 'unsigned', 'void', 'volatile', 'while',
    'inline', 'restrict', '_Bool', '_Complex', '_Imaginary',
    '_Alignas', '_Alignof', '_Atomic', '_Generic', '_Noreturn',
    '_Static_assert', '_Thread_local',
  ],
  types: [
    'int', 'char', 'float', 'double', 'long', 'short',
    'signed', 'unsigned', 'size_t', 'ssize_t', 'ptrdiff_t',
    'wchar_t', 'int8_t', 'int16_t', 'int32_t', 'int64_t',
    'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
    'FILE', 'NULL', 'va_list', 'time_t', 'clock_t',
    'pid_t', 'pthread_t', 'pthread_mutex_t',
  ],
  literals: [
    'true', 'false', 'NULL',
  ],
  modifiers: [
    'const', 'static', 'extern', 'register', 'volatile',
    'inline', 'restrict', '_Atomic', '_Noreturn',
  ],
  operators: [
    '+', '-', '*', '/', '%', '++', '--',
    '==', '!=', '>', '<', '>=', '<=',
    '&&', '||', '!', '&', '|', '^', '~',
    '<<', '>>',
    '=', '+=', '-=', '*=', '/=', '%=',
    '&=', '|=', '^=', '<<=', '>>=',
    '->', '.', '&', '*',
  ],
  delimiters: [
    '{', '}', '(', ')', '[', ']',
    ';', ',', '#', '##', '...',
  ],
});
