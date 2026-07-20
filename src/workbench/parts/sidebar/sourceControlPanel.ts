import { $, append, clearNode } from '../../../base/browser/dom.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { iconPlus, iconMinus, iconClose, iconSync, iconUpload, createIconElement } from '../../../base/browser/icons.js';
import * as git from './gitService.js';
import type { GitFileEntry, GitStatus } from './gitService.js';

/**
 * VS Code-style Source Control view: branch name, a commit-message box, Pull/Push, and
 * Staged/Changes sections with per-file stage/unstage/discard actions. Talks to the real
 * `git` binary via gitOps (see main.cjs's git:* handlers) — there is no virtual/simulated
 * git state here, every action shown actually ran.
 */
export class SourceControlPanel {
  private readonly _disposables = new DisposableStore();
  private _status: GitStatus | null = null;
  private _busy = false;
  private _messageInput!: HTMLTextAreaElement;

  constructor(
    private readonly _container: HTMLElement,
    private readonly _getWorkspacePath: () => string | null,
    private readonly _onOpenFile?: (path: string, label: string) => void,
    /** Notified with the freshly-fetched status every time _refresh() completes (null
     *  when there's no workspace open) — lets sidebarPart relay it to the status bar's
     *  branch indicator without a second, independent git:status call. */
    private readonly _onStatusChange?: (status: GitStatus | null) => void,
  ) {
    void this._refresh();
  }

  dispose(): void {
    this._disposables.dispose();
  }

  /** Called by sidebarPart when the user opens a different workspace folder while this
   *  panel is (or was) mounted, so a stale status from the previous folder isn't shown. */
  refresh(): void {
    void this._refresh();
  }

  private async _refresh(): Promise<void> {
    const cwd = this._getWorkspacePath();
    if (!cwd) {
      this._status = null;
      this._render();
      this._onStatusChange?.(null);
      return;
    }
    try {
      this._status = await git.getStatus(cwd);
    } catch (err) {
      this._status = { isRepo: false, error: err instanceof Error ? err.message : String(err), staged: [], unstaged: [] };
    }
    this._render();
    this._onStatusChange?.(this._status);
  }

  private _render(): void {
    clearNode(this._container);

    const header = $('div', ['sidebar-section-header']);
    header.textContent = 'SOURCE CONTROL';
    append(this._container, header);

    const cwd = this._getWorkspacePath();
    if (!cwd) {
      const msg = $('div', ['sidebar-placeholder']);
      msg.textContent = 'Abre una carpeta para usar el control de código fuente.';
      append(this._container, msg);
      return;
    }

    const status = this._status;
    if (!status) {
      const msg = $('div', ['sidebar-placeholder']);
      msg.textContent = 'Cargando estado de git…';
      append(this._container, msg);
      return;
    }

    if (!status.isRepo) {
      const msg = $('div', ['sidebar-placeholder']);
      msg.textContent = status.error ?? 'Esta carpeta no es un repositorio git.';
      append(this._container, msg);

      const initBtn = $('div', ['ext-import-btn']);
      initBtn.textContent = '📁 Inicializar Repositorio';
      initBtn.addEventListener('click', () => void this._run(() => git.initRepo(cwd)));
      append(this._container, initBtn);
      return;
    }

    // ── Branch + commit box ──
    const branchRow = $('div', ['scm-branch-row']);
    append(branchRow, createIconElement(iconSync()));
    const branchLabel = $('span', ['scm-branch-label']);
    branchLabel.textContent = status.branch || '(sin rama)';
    append(branchRow, branchLabel);
    append(this._container, branchRow);

    this._messageInput = document.createElement('textarea');
    this._messageInput.className = 'scm-message-input';
    this._messageInput.placeholder = 'Mensaje (Ctrl+Enter para confirmar)';
    this._messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void this._commit();
      }
    });
    append(this._container, this._messageInput);

    const commitBtn = $('button', ['scm-commit-btn']);
    commitBtn.textContent = this._busy ? 'Trabajando…' : `✓ Confirmar${status.staged.length ? ` (${status.staged.length})` : ''}`;
    (commitBtn as HTMLButtonElement).disabled = this._busy || status.staged.length === 0;
    commitBtn.addEventListener('click', () => void this._commit());
    append(this._container, commitBtn);

    const syncRow = $('div', ['scm-sync-row']);
    const pullBtn = $('button', ['scm-sync-btn']);
    append(pullBtn, createIconElement(iconSync()));
    pullBtn.append(' Pull');
    pullBtn.addEventListener('click', () => void this._run(() => git.pull(cwd)));
    append(syncRow, pullBtn);

    const pushBtn = $('button', ['scm-sync-btn']);
    append(pushBtn, createIconElement(iconUpload()));
    pushBtn.append(' Push');
    pushBtn.addEventListener('click', () => void this._run(() => git.push(cwd)));
    append(syncRow, pushBtn);
    append(this._container, syncRow);

    // ── Staged Changes ──
    if (status.staged.length > 0) {
      append(this._container, this._sectionHeader(
        `CAMBIOS EN ETAPA (${status.staged.length})`,
        [{ icon: iconMinus, title: 'Quitar todo del área de preparación', onClick: () => void this._run(() => git.unstage(cwd, 'all')) }],
      ));
      for (const file of status.staged) {
        append(this._container, this._fileRow(cwd, file, [
          { icon: iconMinus, title: 'Quitar del área de preparación', onClick: () => void this._run(() => git.unstage(cwd, [file.path])) },
        ]));
      }
    }

    // ── Changes ──
    if (status.unstaged.length > 0) {
      append(this._container, this._sectionHeader(
        `CAMBIOS (${status.unstaged.length})`,
        [
          { icon: iconClose, title: 'Descartar todos los cambios', onClick: () => void this._discardAllConfirm(cwd) },
          { icon: iconPlus, title: 'Agregar todo al área de preparación', onClick: () => void this._run(() => git.stage(cwd, 'all')) },
        ],
      ));
      for (const file of status.unstaged) {
        append(this._container, this._fileRow(cwd, file, [
          { icon: iconClose, title: 'Descartar cambios', onClick: () => void this._discardOneConfirm(cwd, file) },
          { icon: iconPlus, title: 'Agregar al área de preparación', onClick: () => void this._run(() => git.stage(cwd, [file.path])) },
        ]));
      }
    }

    if (status.staged.length === 0 && status.unstaged.length === 0) {
      const msg = $('div', ['sidebar-placeholder']);
      msg.textContent = 'No hay cambios detectados.';
      append(this._container, msg);
    }
  }

  private _sectionHeader(title: string, actions: Array<{ icon: () => string; title: string; onClick: () => void }>): HTMLElement {
    const row = $('div', ['scm-section-header']);
    const label = $('span', ['scm-section-title']);
    label.textContent = title;
    append(row, label);
    const actionsWrap = $('span', ['scm-section-actions']);
    for (const action of actions) {
      const btn = $('button', ['scm-icon-btn']);
      btn.title = action.title;
      append(btn, createIconElement(action.icon()));
      btn.addEventListener('click', (e) => { e.stopPropagation(); action.onClick(); });
      append(actionsWrap, btn);
    }
    append(row, actionsWrap);
    return row;
  }

  private _fileRow(cwd: string, file: GitFileEntry, actions: Array<{ icon: () => string; title: string; onClick: () => void }>): HTMLElement {
    const row = $('div', ['scm-file-row']);

    const badge = $('span', ['scm-status-badge', `scm-status-${git.statusBadge(file.status)}`]);
    badge.textContent = git.statusBadge(file.status);
    badge.title = git.statusLabel(file.status);
    append(row, badge);

    const name = $('span', ['scm-file-path']);
    name.textContent = file.path;
    name.title = file.path;
    append(row, name);

    if (this._onOpenFile) {
      const root = this._status?.root ?? cwd;
      const sep = root.includes('\\') ? '\\' : '/';
      const absPath = `${root}${sep}${file.path.replace(/\//g, sep)}`;
      const label = file.path.split(/[\\/]/).pop() ?? file.path;
      row.classList.add('scm-file-row-clickable');
      row.addEventListener('click', () => this._onOpenFile!(absPath, label));
    }

    const actionsWrap = $('span', ['scm-row-actions']);
    for (const action of actions) {
      const btn = $('button', ['scm-icon-btn']);
      btn.title = action.title;
      append(btn, createIconElement(action.icon()));
      btn.addEventListener('click', (e) => { e.stopPropagation(); action.onClick(); });
      append(actionsWrap, btn);
    }
    append(row, actionsWrap);

    return row;
  }

  private async _commit(): Promise<void> {
    const cwd = this._getWorkspacePath();
    if (!cwd || !this._status) return;
    const message = this._messageInput.value;
    // Matches VS Code's own convenience: if nothing is staged, commit stages everything
    // first — deliberately kept here in the panel rather than in the git:commit IPC, so
    // the IPC stays a dumb `git commit -m` and this UI-level convenience is easy to see
    // and change independently.
    await this._run(async () => {
      if (this._status!.staged.length === 0) {
        const stageResult = await git.stage(cwd, 'all');
        if (!stageResult.success) return stageResult;
      }
      const result = await git.commit(cwd, message);
      if (result.success) this._messageInput.value = '';
      return result;
    });
  }

  private async _discardOneConfirm(cwd: string, file: GitFileEntry): Promise<void> {
    if (!confirm(`¿Descartar los cambios en "${file.path}"? Esta acción no se puede deshacer.`)) return;
    await this._run(() => git.discard(cwd, [file.path]));
  }

  private async _discardAllConfirm(cwd: string): Promise<void> {
    if (!confirm('¿Descartar TODOS los cambios sin confirmar? Esta acción no se puede deshacer.')) return;
    await this._run(() => git.discard(cwd, 'all'));
  }

  private async _run(action: () => Promise<HydraGitResult>): Promise<void> {
    if (this._busy) return;
    this._busy = true;
    this._render();
    try {
      const result = await action();
      if (!result.success) alert(result.error ?? 'Error al ejecutar la operación de git.');
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      this._busy = false;
      await this._refresh();
    }
  }
}
