import '@xterm/xterm/css/xterm.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

export class TerminalPanel {
  private _terminal: Terminal;
  private _fitAddon: FitAddon;
  private _id: string;
  private _disposeListeners: Array<() => void> = [];
  readonly whenReady: Promise<void>;

  constructor(private _container: HTMLElement) {
    this._id = `term-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    this._terminal = new Terminal({
      theme: {
        background: '#141822',
        foreground: '#ccd4e2',
        cursor: '#ccd4e2',
        selectionBackground: '#2b4165',
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
    // Resolves once the PTY is actually created (or once we've established there's no
    // Electron backend to create one) — sendCommand() awaits this so a command typed in
    // right after the terminal is (lazily) constructed doesn't get lost.
    this.whenReady = this._init();
  }

  private async _init(): Promise<void> {
    const api = window.electronAPI;
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

    // Real PTY (node-pty/ConPTY) on the main-process side: the shell echoes its
    // own input and handles line editing, so raw keystrokes are forwarded as-is
    // with no local echo or buffering — exactly like a native terminal.
    this._terminal.onData((data) => {
      api.terminalOps.write(this._id, data);
    });

    this.fit();
  }

  fit(): void {
    try {
      this._fitAddon.fit();
      const dims = this._fitAddon.proposeDimensions();
      if (dims) {
        window.electronAPI?.terminalOps?.resize(this._id, dims.cols, dims.rows);
      }
    } catch {
      // fit may fail before the terminal has a size
    }
  }

  focus(): void {
    this._terminal.focus();
  }

  /** Types `command` into the PTY as if the user had, then presses Enter — for driving a
   *  real, interactive shell command (e.g. compiling and running a program that reads
   *  stdin) from outside the terminal, rather than the isolated run:execute pipe. */
  async sendCommand(command: string): Promise<void> {
    await this.whenReady;
    const api = window.electronAPI;
    if (!api?.terminalOps) return;
    await api.terminalOps.write(this._id, command + '\r');
  }

  dispose(): void {
    const api = window.electronAPI;
    if (api?.terminalOps) {
      api.terminalOps.kill(this._id);
      for (const fn of this._disposeListeners) fn();
    }
    this._terminal.dispose();
  }
}
