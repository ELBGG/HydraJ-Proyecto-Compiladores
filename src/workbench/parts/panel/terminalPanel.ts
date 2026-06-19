import '@xterm/xterm/css/xterm.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

export class TerminalPanel {
  private _terminal: Terminal;
  private _fitAddon: FitAddon;
  private _id: string;
  private _disposeListeners: Array<() => void> = [];

  constructor(private _container: HTMLElement) {
    this._id = `term-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    this._terminal = new Terminal({
      theme: {
        background: '#1e1e1e',
        foreground: '#cccccc',
        cursor: '#cccccc',
        selectionBackground: '#264f78',
        black: '#000000', red: '#cd3131', green: '#0dbc79', yellow: '#e5e510',
        blue: '#2472c8', magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5',
        brightBlack: '#666666', brightRed: '#f14c4c', brightGreen: '#23d18b',
        brightYellow: '#f5f543', brightBlue: '#3b8eea', brightMagenta: '#d670d6',
        brightCyan: '#29b8db', brightWhite: '#e5e5e5',
      },
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      convertEol: true,
      scrollback: 1000,
    });

    this._fitAddon = new FitAddon();
    this._terminal.loadAddon(this._fitAddon);
    this._terminal.open(this._container);
    this._init();
  }

  private async _init(): Promise<void> {
    const api = (window as any).electronAPI;
    if (!api?.terminalOps) {
      this._terminal.write('\r\n  \x1b[33mTerminal solo disponible en Electron.\x1b[0m\r\n');
      this.fit();
      return;
    }

    this._terminal.write('\x1b[2mIniciando terminal...\x1b[0m\r\n');

    const result = await api.terminalOps.create(this._id);
    if (!result.success) {
      this._terminal.write(`\r\n\x1b[31mError: ${result.error ?? 'no se pudo iniciar el shell'}\x1b[0m\r\n`);
      this.fit();
      return;
    }

    const removeData = api.terminalOps.onData(this._id, (data: string) => {
      this._terminal.write(data);
    });
    const removeExit = api.terminalOps.onExit(this._id, (code: number) => {
      this._terminal.write(`\r\n\x1b[2m[Shell finalizado — código ${code}]\x1b[0m\r\n`);
    });
    this._disposeListeners.push(removeData, removeExit);

    // Local echo (no PTY — shell won't echo on its own)
    let _lineBuffer = '';
    this._terminal.onData((data) => {
      for (const char of data) {
        const code = char.charCodeAt(0);
        if (code === 13) {
          // Enter
          this._terminal.write('\r\n');
          api.terminalOps.write(this._id, _lineBuffer + '\n');
          _lineBuffer = '';
          return;
        } else if (code === 127 || code === 8) {
          // Backspace
          if (_lineBuffer.length > 0) {
            _lineBuffer = _lineBuffer.slice(0, -1);
            this._terminal.write('\b \b');
          }
        } else if (code >= 32 && code < 127) {
          _lineBuffer += char;
          this._terminal.write(char);
        } else if (code === 3) {
          // Ctrl+C
          _lineBuffer = '';
          this._terminal.write('^C\r\n');
          api.terminalOps.write(this._id, '\x03');
        } else {
          // Pass other control sequences (arrows etc.) directly
          api.terminalOps.write(this._id, data);
          return;
        }
      }
    });

    this.fit();
  }

  fit(): void {
    try {
      this._fitAddon.fit();
      const dims = this._fitAddon.proposeDimensions();
      if (dims) {
        (window as any).electronAPI?.terminalOps?.resize(this._id, dims.cols, dims.rows);
      }
    } catch {
      // fit may fail before the terminal has a size
    }
  }

  focus(): void {
    this._terminal.focus();
  }

  dispose(): void {
    const api = (window as any).electronAPI;
    if (api?.terminalOps) {
      api.terminalOps.kill(this._id);
      for (const fn of this._disposeListeners) fn();
    }
    this._terminal.dispose();
  }
}
