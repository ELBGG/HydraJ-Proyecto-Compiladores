import { ContextKeyExpression } from '../../contextkey/common/contextkey.js';
import { ICommandHandler } from '../../commands/common/commands.js';
import { CommandsRegistry } from '../../commands/common/commands.js';

export interface IKeybindingRule {
  id: string;
  weight: number;
  when?: ContextKeyExpression;
  primary: string;
  mac?: string;
  linux?: string;
  win?: string;
}

export interface ICommandAndKeybindingRule extends IKeybindingRule {
  handler: ICommandHandler;
}

export interface IResolvedKeybindingItem {
  keybinding: string;
  command: string;
  when?: ContextKeyExpression;
  weight: number;
}

class KeybindingsRegistryImpl {
  private readonly _keybindings: IResolvedKeybindingItem[] = [];

  registerKeybindingRule(rule: IKeybindingRule): void {
    const keybinding = this._pickPlatformKeybinding(rule);
    if (!keybinding) return;
    this._keybindings.push({ keybinding, command: rule.id, when: rule.when, weight: rule.weight });
  }

  registerCommandAndKeybindingRule(desc: ICommandAndKeybindingRule): void {
    CommandsRegistry.registerCommand(desc.id, desc.handler);
    this.registerKeybindingRule(desc);
  }

  getKeybindings(): readonly IResolvedKeybindingItem[] {
    return this._keybindings;
  }

  private _pickPlatformKeybinding(rule: IKeybindingRule): string | undefined {
    const isMac = typeof navigator === 'object' && navigator.userAgent.indexOf('Macintosh') >= 0;
    const isLinux = typeof navigator === 'object' && navigator.userAgent.indexOf('Linux') >= 0;
    if (isMac && rule.mac) return rule.mac;
    if (isLinux && rule.linux) return rule.linux;
    if (!isMac && rule.win) return rule.win;
    return rule.primary;
  }
}

export const KeybindingsRegistry = new KeybindingsRegistryImpl();
