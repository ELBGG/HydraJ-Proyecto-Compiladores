import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export interface IResolvedKeybinding {
  getLabel(): string | null;
}

export const IKeybindingService = createDecorator<IKeybindingService>('keybindingService');

export interface IKeybindingService {
  readonly _serviceBrand: undefined;
  readonly onDidUpdateKeybindings: Event<void>;
  lookupKeybinding(commandId: string): IResolvedKeybinding | undefined;
}

export function normalizeKeyboardEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('ctrl');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  if (e.metaKey) parts.push('meta');
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  if (!['control', 'shift', 'alt', 'meta'].includes(key)) {
    parts.push(key);
  }
  return parts.join('+');
}

export function normalizeKeybindingString(binding: string): string {
  return binding
    .split('+')
    .map(p => p.trim().toLowerCase())
    .sort((a, b) => {
      const order = ['ctrl', 'shift', 'alt', 'meta'];
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    })
    .join('+');
}
