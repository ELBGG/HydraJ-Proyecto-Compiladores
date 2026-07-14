export interface ColorTheme {
  name: string;
  colors: Record<string, string>;
}

/**
 * HydraCode Dark — "tinta y cinco cabezas".
 * Deep blue-cast ink chrome; the only saturated color in the workbench is the
 * active-language accent (--hydra-accent), defined in style.css and switched
 * via the data-hydra-lang attribute on <html>.
 */
export const vsCodeDark: ColorTheme = {
  name: 'HydraCode Dark',
  colors: {
    '--vscode-foreground': '#ccd4e2',
    '--vscode-disabledForeground': '#5b6373',
    '--vscode-errorForeground': '#f26d6d',
    '--vscode-descriptionForeground': '#8a93a6',
    '--vscode-icon-foreground': '#a9b2c4',
    '--vscode-focusBorder': 'var(--hydra-accent)',
    '--vscode-selection-background': '#2b4165',
    '--vscode-textLink-foreground': 'var(--hydra-accent)',
    '--vscode-textLink-activeForeground': 'var(--hydra-accent)',
    '--vscode-textPreformat-foreground': '#e5c15c',
    '--vscode-textBlockQuote-background': '#161b24',
    '--vscode-textBlockQuote-border': '#232a38',
    '--vscode-sash-hoverBorder': 'var(--hydra-accent)',
    '--vscode-window-border': '#232a38',

    /* Workbench */
    '--vscode-workbench-background': '#12161f',
    '--vscode-editor-background': '#171c26',
    '--vscode-editor-foreground': '#d2d9e6',
    '--vscode-editorWidget-background': '#1a2029',
    '--vscode-editorWidget-border': '#232a38',
    '--vscode-editorWidget-foreground': '#ccd4e2',

    /* Activity Bar */
    '--vscode-activityBar-background': '#0e1218',
    '--vscode-activityBar-foreground': '#dbe2ee',
    '--vscode-activityBar-inactiveForeground': '#5b6373',
    '--vscode-activityBar-activeBorder': 'var(--hydra-accent)',
    '--vscode-activityBar-activeBackground': 'var(--hydra-accent-soft)',
    '--vscode-activityBar-border': '#1b202b',

    /* Side Bar */
    '--vscode-sideBar-background': '#141822',
    '--vscode-sideBar-foreground': '#b7c0d1',
    '--vscode-sideBar-border': '#1b202b',
    '--vscode-sideBarTitle-foreground': '#8a93a6',
    '--vscode-sideBarSectionHeader-background': '#171c26',
    '--vscode-sideBarSectionHeader-foreground': '#8a93a6',

    /* Panel (bottom) */
    '--vscode-panel-background': '#141822',
    '--vscode-panel-foreground': '#b7c0d1',
    '--vscode-panel-border': '#1b202b',
    '--vscode-panelTitle-activeForeground': '#dbe2ee',
    '--vscode-panelTitle-inactiveForeground': '#5b6373',
    '--vscode-panelTitle-activeBorder': 'var(--hydra-accent)',
    '--vscode-panelInput-border': '#232a38',

    /* Status Bar — quiet ink; the language chip carries the accent */
    '--vscode-statusBar-background': '#0e1218',
    '--vscode-statusBar-foreground': '#8a93a6',
    '--vscode-statusBar-border': '#1b202b',
    '--vscode-statusBar-noFolderBackground': '#0e1218',
    '--vscode-statusBarItem-hoverBackground': 'rgba(148, 163, 190, 0.10)',
    '--vscode-statusBarItem-activeBackground': 'rgba(148, 163, 190, 0.16)',

    /* Title Bar */
    '--vscode-titleBar-activeBackground': '#0e1218',
    '--vscode-titleBar-activeForeground': '#b7c0d1',
    '--vscode-titleBar-inactiveBackground': '#0e1218',
    '--vscode-titleBar-inactiveForeground': '#5b6373',
    '--vscode-titleBar-border': '#1b202b',

    /* Editor Tabs */
    '--vscode-tab-activeBackground': '#171c26',
    '--vscode-tab-activeForeground': '#e6ebf4',
    '--vscode-tab-inactiveBackground': '#12161f',
    '--vscode-tab-inactiveForeground': '#767f92',
    '--vscode-tab-border': '#1b202b',
    '--vscode-tab-activeBorderTop': 'var(--hydra-accent)',
    '--vscode-tab-hoverBackground': '#161b24',

    /* Input */
    '--vscode-input-background': '#0e1218',
    '--vscode-input-foreground': '#ccd4e2',
    '--vscode-input-border': '#232a38',
    '--vscode-input-placeholderForeground': '#5b6373',

    /* List/Tree */
    '--vscode-list-activeSelectionBackground': 'var(--hydra-accent-soft)',
    '--vscode-list-activeSelectionForeground': '#e6ebf4',
    '--vscode-list-inactiveSelectionBackground': 'rgba(148, 163, 190, 0.08)',
    '--vscode-list-inactiveSelectionForeground': '#ccd4e2',
    '--vscode-list-hoverBackground': 'rgba(148, 163, 190, 0.07)',
    '--vscode-list-hoverForeground': '#dbe2ee',
    '--vscode-list-focusBackground': 'var(--hydra-accent-soft)',
    '--vscode-list-focusForeground': '#e6ebf4',

    /* Scrollbar */
    '--vscode-scrollbarSlider-background': 'rgba(122, 134, 156, 0.25)',
    '--vscode-scrollbarSlider-hoverBackground': 'rgba(122, 134, 156, 0.40)',
    '--vscode-scrollbarSlider-activeBackground': 'rgba(122, 134, 156, 0.55)',

    /* Badge */
    '--vscode-badge-background': 'var(--hydra-accent)',
    '--vscode-badge-foreground': '#0e1218',

    /* Button */
    '--vscode-button-background': 'var(--hydra-accent)',
    '--vscode-button-foreground': '#10141c',
    '--vscode-button-hoverBackground': 'color-mix(in srgb, var(--hydra-accent) 85%, white)',

    /* Menu */
    '--vscode-menu-background': '#1a2029',
    '--vscode-menu-foreground': '#ccd4e2',
    '--vscode-menu-border': '#232a38',
    '--vscode-menu-separatorBackground': '#232a38',
    '--vscode-menu-selectionBackground': 'var(--hydra-accent-soft)',
    '--vscode-menu-selectionForeground': '#e6ebf4',

    /* Notifications */
    '--vscode-notification-background': '#1a2029',
    '--vscode-notification-foreground': '#ccd4e2',
    '--vscode-notification-border': '#232a38',
  },
};

export const vsCodeLight: ColorTheme = {
  name: 'HydraCode Light',
  colors: {
    '--vscode-foreground': '#616161',
    '--vscode-disabledForeground': '#a0a0a0',
    '--vscode-errorForeground': '#d14a2c',
    '--vscode-descriptionForeground': '#6f6f6f',
    '--vscode-icon-foreground': '#616161',
    '--vscode-focusBorder': '#007acc',
    '--vscode-selection-background': '#add6ff',
    '--vscode-textLink-foreground': '#006ab1',
    '--vscode-textLink-activeForeground': '#006ab1',
    '--vscode-textPreformat-foreground': '#7b3814',
    '--vscode-textBlockQuote-background': '#f2f2f2',
    '--vscode-textBlockQuote-border': '#c8c8c8',
    '--vscode-sash-hoverBorder': '#007acc',
    '--vscode-window-border': '#e0e0e0',

    '--vscode-workbench-background': '#f3f3f3',
    '--vscode-editor-background': '#ffffff',
    '--vscode-editor-foreground': '#000000',
    '--vscode-editorWidget-background': '#f3f3f3',
    '--vscode-editorWidget-border': '#c8c8c8',
    '--vscode-editorWidget-foreground': '#616161',

    '--vscode-activityBar-background': '#2c2c2c',
    '--vscode-activityBar-foreground': '#ffffff',
    '--vscode-activityBar-inactiveForeground': '#8c8c8c',
    '--vscode-activityBar-activeBorder': '#ffffff',
    '--vscode-activityBar-activeBackground': '#3c3c3c',
    '--vscode-activityBar-border': '#1e1e1e',

    '--vscode-sideBar-background': '#f3f3f3',
    '--vscode-sideBar-foreground': '#616161',
    '--vscode-sideBar-border': '#e0e0e0',
    '--vscode-sideBarTitle-foreground': '#6f6f6f',
    '--vscode-sideBarSectionHeader-background': '#ebebeb',
    '--vscode-sideBarSectionHeader-foreground': '#616161',

    '--vscode-panel-background': '#f3f3f3',
    '--vscode-panel-foreground': '#616161',
    '--vscode-panel-border': '#e0e0e0',
    '--vscode-panelTitle-activeForeground': '#424242',
    '--vscode-panelTitle-inactiveForeground': '#8c8c8c',
    '--vscode-panelTitle-activeBorder': '#424242',
    '--vscode-panelInput-border': '#c8c8c8',

    '--vscode-statusBar-background': '#007acc',
    '--vscode-statusBar-foreground': '#ffffff',
    '--vscode-statusBar-border': '#e0e0e0',
    '--vscode-statusBar-noFolderBackground': '#007acc',
    '--vscode-statusBarItem-hoverBackground': '#0088e0',
    '--vscode-statusBarItem-activeBackground': '#0099f0',

    '--vscode-titleBar-activeBackground': '#dddddd',
    '--vscode-titleBar-activeForeground': '#333333',
    '--vscode-titleBar-inactiveBackground': '#f3f3f3',
    '--vscode-titleBar-inactiveForeground': '#8c8c8c',
    '--vscode-titleBar-border': '#e0e0e0',

    '--vscode-tab-activeBackground': '#ffffff',
    '--vscode-tab-activeForeground': '#333333',
    '--vscode-tab-inactiveBackground': '#ececec',
    '--vscode-tab-inactiveForeground': '#8c8c8c',
    '--vscode-tab-border': '#e0e0e0',
    '--vscode-tab-activeBorderTop': '#007acc',
    '--vscode-tab-hoverBackground': '#e8e8e8',

    '--vscode-input-background': '#ffffff',
    '--vscode-input-foreground': '#616161',
    '--vscode-input-border': '#c8c8c8',
    '--vscode-input-placeholderForeground': '#8c8c8c',

    '--vscode-list-activeSelectionBackground': '#007acc',
    '--vscode-list-activeSelectionForeground': '#ffffff',
    '--vscode-list-inactiveSelectionBackground': '#e4e6f1',
    '--vscode-list-inactiveSelectionForeground': '#333333',
    '--vscode-list-hoverBackground': '#e8e8e8',
    '--vscode-list-hoverForeground': '#333333',
    '--vscode-list-focusBackground': '#007acc',
    '--vscode-list-focusForeground': '#ffffff',

    '--vscode-scrollbarSlider-background': '#c4c4c44d',
    '--vscode-scrollbarSlider-hoverBackground': '#a0a0a08a',
    '--vscode-scrollbarSlider-activeBackground': '#6060608a',

    '--vscode-badge-background': '#c4c4c4',
    '--vscode-badge-foreground': '#333333',

    '--vscode-button-background': '#007acc',
    '--vscode-button-foreground': '#ffffff',
    '--vscode-button-hoverBackground': '#0062a3',

    '--vscode-menu-background': '#ffffff',
    '--vscode-menu-foreground': '#616161',
    '--vscode-menu-border': '#c8c8c8',
    '--vscode-menu-selectionBackground': '#007acc',
    '--vscode-menu-selectionForeground': '#ffffff',

    '--vscode-notification-background': '#f3f3f3',
    '--vscode-notification-foreground': '#616161',
    '--vscode-notification-border': '#c8c8c8',
  },
};

export function applyTheme(theme: ColorTheme): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(key, value);
  }
  document.documentElement.style.setProperty('--vscode-workbench-background', theme.colors['--vscode-workbench-background']);
}
