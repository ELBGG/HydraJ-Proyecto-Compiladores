import { IDisposable, toDisposable } from '../common/lifecycle.js';

export const EventType = {
  Start: '-monaco-gesturestart',
  Change: '-monaco-gesturechange',
  End: '-monaco-gestureend',
  Tap: '-monaco-gesturetap',
} as const;

export class Gesture {
  static addTarget(_element: HTMLElement): IDisposable {
    return toDisposable(() => {});
  }
}
