import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ICommandService } from '../../commands/common/commands.js';
import { IContextKeyService } from '../../contextkey/common/contextkey.js';
import { IKeybindingService, IResolvedKeybinding, normalizeKeyboardEvent, normalizeKeybindingString } from '../common/keybinding.js';
import { IResolvedKeybindingItem, KeybindingsRegistry } from '../common/keybindingsRegistry.js';

class ResolvedKeybinding implements IResolvedKeybinding {
  constructor(private readonly _keybinding: string) {}
  getLabel(): string | null {
    return this._keybinding
      .split('+')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('+');
  }
}

export class KeybindingService extends Disposable implements IKeybindingService {
  declare readonly _serviceBrand: undefined;

  private readonly _onDidUpdateKeybindings = this._register(new Emitter<void>());
  readonly onDidUpdateKeybindings: Event<void> = this._onDidUpdateKeybindings.event;

  constructor(
    @ICommandService private readonly _commandService: ICommandService,
    @IContextKeyService private readonly _contextKeyService: IContextKeyService,
  ) {
    super();
    this._register({
      dispose: () => window.removeEventListener('keydown', this._onKeyDown, true),
    });
    window.addEventListener('keydown', this._onKeyDown, true);
  }

  private readonly _onKeyDown = (e: KeyboardEvent): void => {
    const pressed = normalizeKeyboardEvent(e);
    if (!pressed) return;

    // Collect every binding that matches the pressed keys and whose `when`
    // clause is satisfied, then pick the most specific one by weight.
    // Ties go to the most-recently-registered rule (registration order is
    // preserved by KeybindingsRegistry, so a later `>=` comparison wins).
    let best: IResolvedKeybindingItem | undefined;

    for (const item of KeybindingsRegistry.getKeybindings()) {
      if (normalizeKeybindingString(item.keybinding) !== pressed) continue;
      if (item.when && !this._contextKeyService.contextMatchesRules(item.when)) continue;

      if (!best || item.weight >= best.weight) {
        best = item;
      }
    }

    if (best) {
      e.preventDefault();
      e.stopPropagation();
      this._commandService.executeCommand(best.command);
    }
  };

  lookupKeybinding(commandId: string): IResolvedKeybinding | undefined {
    const item = KeybindingsRegistry.getKeybindings().find(k => k.command === commandId);
    return item ? new ResolvedKeybinding(item.keybinding) : undefined;
  }
}
