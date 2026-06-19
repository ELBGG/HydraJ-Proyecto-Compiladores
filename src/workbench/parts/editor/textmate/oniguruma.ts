import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma';
import type { IOnigLib } from 'vscode-textmate';
import onigWasmUrl from 'vscode-oniguruma/release/onig.wasm?url';

let _lib: Promise<IOnigLib> | null = null;

export function getOnigLib(): Promise<IOnigLib> {
  if (!_lib) {
    _lib = fetch(onigWasmUrl)
      .then(r => r.arrayBuffer())
      .then(buf => loadWASM(buf))
      .then(() => ({
        createOnigScanner(patterns: string[]) { return new OnigScanner(patterns); },
        createOnigString(str: string) { return new OnigString(str); },
      }));
  }
  return _lib;
}
