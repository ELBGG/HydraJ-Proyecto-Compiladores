import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { CommandsRegistry, ICommandEvent, ICommandService } from './commands.js';

export class CommandService extends Disposable implements ICommandService {

  declare readonly _serviceBrand: undefined;

  private readonly _onWillExecuteCommand = this._register(new Emitter<ICommandEvent>());
  readonly onWillExecuteCommand: Event<ICommandEvent> = this._onWillExecuteCommand.event;

  private readonly _onDidExecuteCommand = this._register(new Emitter<ICommandEvent>());
  readonly onDidExecuteCommand: Event<ICommandEvent> = this._onDidExecuteCommand.event;

  constructor(
    @IInstantiationService private readonly _instantiationService: IInstantiationService,
  ) {
    super();
  }

  async executeCommand<T>(id: string, ...args: unknown[]): Promise<T | undefined> {
    const command = CommandsRegistry.getCommand(id);
    if (!command) {
      throw new Error(`command '${id}' not found`);
    }
    this._onWillExecuteCommand.fire({ commandId: id, args });
    const result = this._instantiationService.invokeFunction(command.handler, ...args);
    this._onDidExecuteCommand.fire({ commandId: id, args });
    return result as T;
  }
}
