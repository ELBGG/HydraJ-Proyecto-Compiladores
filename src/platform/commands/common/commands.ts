import { Emitter, Event } from '../../../base/common/event.js';
import { IDisposable, markAsSingleton, toDisposable } from '../../../base/common/lifecycle.js';
import { LinkedList } from '../../../base/common/linkedList.js';
import { createDecorator, ServicesAccessor } from '../../instantiation/common/instantiation.js';

export const ICommandService = createDecorator<ICommandService>('commandService');

export interface ICommandEvent {
  readonly commandId: string;
  readonly args: unknown[];
}

export interface ICommandService {
  readonly _serviceBrand: undefined;
  readonly onWillExecuteCommand: Event<ICommandEvent>;
  readonly onDidExecuteCommand: Event<ICommandEvent>;
  executeCommand<R = unknown>(commandId: string, ...args: unknown[]): Promise<R | undefined>;
}

export type ICommandsMap = Map<string, ICommand>;

export type ICommandHandler<Args extends unknown[] = unknown[], R = void> = (accessor: ServicesAccessor, ...args: Args) => R;

export interface ICommand<Args extends unknown[] = unknown[], R = void> {
  id: string;
  handler: ICommandHandler<Args, R>;
}

export interface ICommandRegistry {
  readonly onDidRegisterCommand: Event<string>;
  registerCommand<Args extends unknown[]>(id: string, command: ICommandHandler<Args>): IDisposable;
  registerCommand<Args extends unknown[]>(command: ICommand<Args>): IDisposable;
  getCommand(id: string): ICommand | undefined;
  getCommands(): ICommandsMap;
}

export const CommandsRegistry: ICommandRegistry = new class implements ICommandRegistry {

  private readonly _commands = new Map<string, LinkedList<ICommand>>();

  private readonly _onDidRegisterCommand = new Emitter<string>();
  readonly onDidRegisterCommand: Event<string> = this._onDidRegisterCommand.event;

  registerCommand(idOrCommand: string | ICommand, handler?: ICommandHandler): IDisposable {
    if (!idOrCommand) {
      throw new Error('invalid command');
    }

    if (typeof idOrCommand === 'string') {
      if (!handler) {
        throw new Error('invalid command');
      }
      return this.registerCommand({ id: idOrCommand, handler });
    }

    const { id } = idOrCommand;

    let commands = this._commands.get(id);
    if (!commands) {
      commands = new LinkedList<ICommand>();
      this._commands.set(id, commands);
    }

    const removeFn = commands.unshift(idOrCommand);

    const ret = toDisposable(() => {
      removeFn();
      const command = this._commands.get(id);
      if (command?.isEmpty()) {
        this._commands.delete(id);
      }
    });

    this._onDidRegisterCommand.fire(id);

    return markAsSingleton(ret);
  }

  getCommand(id: string): ICommand | undefined {
    const list = this._commands.get(id);
    if (!list || list.isEmpty()) {
      return undefined;
    }
    for (const command of list) {
      return command;
    }
    return undefined;
  }

  getCommands(): ICommandsMap {
    const result = new Map<string, ICommand>();
    for (const key of this._commands.keys()) {
      const command = this.getCommand(key);
      if (command) {
        result.set(key, command);
      }
    }
    return result;
  }
};
