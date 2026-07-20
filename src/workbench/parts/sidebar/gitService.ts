/**
 * Thin renderer-side wrapper around window.electronAPI.gitOps — mirrors the shape of
 * githubMappingService.ts (a stateless set of functions, no class) since there's no
 * client-side state worth owning here; sourceControlPanel.ts holds the only state
 * (the last-fetched status) and re-fetches after every mutating call.
 */

export interface GitFileEntry {
  path: string;
  status: string;
}

export interface GitStatus {
  isRepo: boolean;
  error?: string;
  branch?: string;
  root?: string;
  staged: GitFileEntry[];
  unstaged: GitFileEntry[];
}

function requireGitOps() {
  const api = window.electronAPI;
  if (!api?.gitOps) throw new Error('gitOps no disponible fuera de Electron.');
  return api.gitOps;
}

export async function getStatus(cwd: string): Promise<GitStatus> {
  const result = await requireGitOps().status(cwd);
  if (!result.success) {
    return { isRepo: result.isRepo, error: result.error, staged: [], unstaged: [] };
  }
  return {
    isRepo: true,
    branch: result.branch,
    root: result.root,
    staged: result.staged ?? [],
    unstaged: result.unstaged ?? [],
  };
}

export async function initRepo(cwd: string): Promise<HydraGitResult> {
  return requireGitOps().init(cwd);
}

export async function stage(cwd: string, paths: string[] | 'all'): Promise<HydraGitResult> {
  return requireGitOps().stage(cwd, paths);
}

export async function unstage(cwd: string, paths: string[] | 'all'): Promise<HydraGitResult> {
  return requireGitOps().unstage(cwd, paths);
}

export async function discard(cwd: string, paths: string[] | 'all'): Promise<HydraGitResult> {
  return requireGitOps().discard(cwd, paths);
}

export async function commit(cwd: string, message: string): Promise<HydraGitResult> {
  return requireGitOps().commit(cwd, message);
}

export async function pull(cwd: string): Promise<HydraGitResult> {
  return requireGitOps().pull(cwd);
}

export async function push(cwd: string): Promise<HydraGitResult> {
  return requireGitOps().push(cwd);
}

const STATUS_LABELS: Record<string, string> = {
  M: 'Modificado',
  A: 'Agregado',
  D: 'Eliminado',
  R: 'Renombrado',
  C: 'Copiado',
  U: 'Conflicto',
  '?': 'Sin seguimiento',
};

/** git's own porcelain letter, except untracked ('?') is shown as 'U' the same way
 *  VS Code's own decoration badges do — a single-glyph badge reads better than '?'. */
export function statusBadge(status: string): string {
  return status === '?' ? 'U' : status;
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
