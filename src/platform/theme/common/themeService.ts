import { Color } from '../../../base/common/color.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IThemeService = createDecorator<IThemeService>('themeService');

export const enum ColorScheme {
  DARK = 'dark',
  LIGHT = 'light',
  HIGH_CONTRAST_DARK = 'hcDark',
  HIGH_CONTRAST_LIGHT = 'hcLight',
}

export interface ITokenStyle {
  readonly foreground: number | undefined;
  readonly bold: boolean | undefined;
  readonly underline: boolean | undefined;
  readonly strikethrough: boolean | undefined;
  readonly italic: boolean | undefined;
}

export interface IColorTheme {
  readonly type: ColorScheme;
  readonly label: string;
  getColor(color: string, useDefault?: boolean): Color | undefined;
  defines(color: string): boolean;
  getTokenStyleMetadata(type: string, modifiers: string[], modelLanguage: string): ITokenStyle | undefined;
  readonly tokenColorMap: string[];
  readonly semanticHighlighting: boolean;
}

export interface IFileIconTheme {
  readonly hasFileIcons: boolean;
  readonly hasFolderIcons: boolean;
  readonly hidesExplorerArrows: boolean;
}

export interface IProductIconTheme {
  getIcon(iconContribution: unknown): unknown | undefined;
}

export interface IThemeService {
  readonly _serviceBrand: undefined;

  getColorTheme(): IColorTheme;
  readonly onDidColorThemeChange: Event<IColorTheme>;

  getFileIconTheme(): IFileIconTheme;
  readonly onDidFileIconThemeChange: Event<IFileIconTheme>;

  getProductIconTheme(): IProductIconTheme;
  readonly onDidProductIconThemeChange: Event<IProductIconTheme>;
}

class DefaultColorTheme implements IColorTheme {
  readonly type = ColorScheme.DARK;
  readonly label = 'HydraCode Dark';
  readonly tokenColorMap: string[] = [];
  readonly semanticHighlighting = false;

  getColor(_color: string, _useDefault?: boolean): Color | undefined {
    return undefined;
  }

  defines(_color: string): boolean {
    return false;
  }

  getTokenStyleMetadata(_type: string, _modifiers: string[], _modelLanguage: string): ITokenStyle | undefined {
    return undefined;
  }
}

const defaultFileIconTheme: IFileIconTheme = {
  hasFileIcons: false,
  hasFolderIcons: false,
  hidesExplorerArrows: false,
};

const defaultProductIconTheme: IProductIconTheme = {
  getIcon: () => undefined,
};

/**
 * Minimal {@link IThemeService} implementation: a single static dark theme,
 * no live theme switching or colorRegistry. Sufficient for {@link Themable}/
 * {@link Component} to function.
 */
export class DefaultThemeService extends Disposable implements IThemeService {
  readonly _serviceBrand: undefined;

  private readonly colorTheme = new DefaultColorTheme();

  private readonly _onDidColorThemeChange = this._register(new Emitter<IColorTheme>());
  readonly onDidColorThemeChange = this._onDidColorThemeChange.event;

  private readonly _onDidFileIconThemeChange = this._register(new Emitter<IFileIconTheme>());
  readonly onDidFileIconThemeChange = this._onDidFileIconThemeChange.event;

  private readonly _onDidProductIconThemeChange = this._register(new Emitter<IProductIconTheme>());
  readonly onDidProductIconThemeChange = this._onDidProductIconThemeChange.event;

  getColorTheme(): IColorTheme {
    return this.colorTheme;
  }

  getFileIconTheme(): IFileIconTheme {
    return defaultFileIconTheme;
  }

  getProductIconTheme(): IProductIconTheme {
    return defaultProductIconTheme;
  }
}

/**
 * Utility base class for all themable components.
 */
export class Themable extends Disposable {
  protected theme: IColorTheme;

  constructor(protected themeService: IThemeService) {
    super();

    this.theme = themeService.getColorTheme();

    this._register(this.themeService.onDidColorThemeChange(theme => this.onThemeChange(theme)));
  }

  protected onThemeChange(theme: IColorTheme): void {
    this.theme = theme;
    this.updateStyles();
  }

  updateStyles(): void {
    // Subclasses to override
  }

  protected getColor(id: string, modify?: (color: Color, theme: IColorTheme) => Color): string | null {
    let color = this.theme.getColor(id);

    if (color && modify) {
      color = modify(color, this.theme);
    }

    return color ? color.toString() : null;
  }
}
