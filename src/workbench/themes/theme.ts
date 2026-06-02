export interface ColorTheme {
  name: string;
  colors: Record<string, string>;
}

export const vsCodeDark: ColorTheme = {
  name: 'HydraCode Dark',
  colors: {
    '--vscode-foreground': '#cccccc',
    '--vscode-disabledForeground': '#c5c5c5',
    '--vscode-errorForeground': '#f48771',
    '--vscode-descriptionForeground': '#bcbcbc',
    '--vscode-icon-foreground': '#c5c5c5',
    '--vscode-focusBorder': '#007fd4',
    '--vscode-selection-background': '#264f78',
    '--vscode-textLink-foreground': '#3794ff',
    '--vscode-textLink-activeForeground': '#3794ff',
    '--vscode-textPreformat-foreground': '#d7ba7d',
    '--vscode-textBlockQuote-background': '#2b2b2b',
    '--vscode-textBlockQuote-border': '#616161',
    '--vscode-sash-hoverBorder': '#007fd4',
    '--vscode-window-border': '#464648',

    /* Workbench */
    '--vscode-workbench-background': '#1e1e1e',
    '--vscode-editor-background': '#1e1e1e',
    '--vscode-editor-foreground': '#d4d4d4',
    '--vscode-editorWidget-background': '#252526',
    '--vscode-editorWidget-border': '#454545',
    '--vscode-editorWidget-foreground': '#cccccc',

    /* Activity Bar */
    '--vscode-activityBar-background': '#333333',
    '--vscode-activityBar-foreground': '#ffffff',
    '--vscode-activityBar-inactiveForeground': '#8c8c8c',
    '--vscode-activityBar-activeBorder': '#ffffff',
    '--vscode-activityBar-activeBackground': '#3c3c3c',
    '--vscode-activityBar-border': '#252526',

    /* Side Bar */
    '--vscode-sideBar-background': '#252526',
    '--vscode-sideBar-foreground': '#cccccc',
    '--vscode-sideBar-border': '#1e1e1e',
    '--vscode-sideBarTitle-foreground': '#bbbbbb',
    '--vscode-sideBarSectionHeader-background': '#2b2b2b',
    '--vscode-sideBarSectionHeader-foreground': '#cccccc',

    /* Panel (bottom) */
    '--vscode-panel-background': '#1e1e1e',
    '--vscode-panel-foreground': '#cccccc',
    '--vscode-panel-border': '#252526',
    '--vscode-panelTitle-activeForeground': '#e7e7e7',
    '--vscode-panelTitle-inactiveForeground': '#8c8c8c',
    '--vscode-panelTitle-activeBorder': '#e7e7e7',
    '--vscode-panelInput-border': '#2b2b2b',

    /* Status Bar */
    '--vscode-statusBar-background': '#007acc',
    '--vscode-statusBar-foreground': '#ffffff',
    '--vscode-statusBar-border': '#252526',
    '--vscode-statusBar-noFolderBackground': '#007acc',
    '--vscode-statusBarItem-hoverBackground': '#0088e0',
    '--vscode-statusBarItem-activeBackground': '#0099f0',

    /* Title Bar */
    '--vscode-titleBar-activeBackground': '#3c3c3c',
    '--vscode-titleBar-activeForeground': '#cccccc',
    '--vscode-titleBar-inactiveBackground': '#2d2d2d',
    '--vscode-titleBar-inactiveForeground': '#8c8c8c',
    '--vscode-titleBar-border': '#252526',

    /* Editor Tabs */
    '--vscode-tab-activeBackground': '#1e1e1e',
    '--vscode-tab-activeForeground': '#ffffff',
    '--vscode-tab-inactiveBackground': '#2d2d2d',
    '--vscode-tab-inactiveForeground': '#8c8c8c',
    '--vscode-tab-border': '#252526',
    '--vscode-tab-activeBorderTop': '#007acc',
    '--vscode-tab-hoverBackground': '#2d2d2d',

    /* Input */
    '--vscode-input-background': '#3c3c3c',
    '--vscode-input-foreground': '#cccccc',
    '--vscode-input-border': '#454545',
    '--vscode-input-placeholderForeground': '#8c8c8c',

    /* List/Tree */
    '--vscode-list-activeSelectionBackground': '#094771',
    '--vscode-list-activeSelectionForeground': '#ffffff',
    '--vscode-list-inactiveSelectionBackground': '#37373d',
    '--vscode-list-inactiveSelectionForeground': '#cccccc',
    '--vscode-list-hoverBackground': '#2a2d2e',
    '--vscode-list-hoverForeground': '#cccccc',
    '--vscode-list-focusBackground': '#094771',
    '--vscode-list-focusForeground': '#ffffff',

    /* Scrollbar */
    '--vscode-scrollbarSlider-background': '#7979794d',
    '--vscode-scrollbarSlider-hoverBackground': '#6464648a',
    '--vscode-scrollbarSlider-activeBackground': '#bfbfbf8a',

    /* Badge */
    '--vscode-badge-background': '#4d4d4d',
    '--vscode-badge-foreground': '#ffffff',

    /* Button */
    '--vscode-button-background': '#0e639c',
    '--vscode-button-foreground': '#ffffff',
    '--vscode-button-hoverBackground': '#1177bb',

    /* Menu */
    '--vscode-menu-background': '#2b2b2b',
    '--vscode-menu-foreground': '#cccccc',
    '--vscode-menu-border': '#454545',
    '--vscode-menu-selectionBackground': '#094771',
    '--vscode-menu-selectionForeground': '#ffffff',

    /* Notifications */
    '--vscode-notification-background': '#252526',
    '--vscode-notification-foreground': '#cccccc',
    '--vscode-notification-border': '#454545',
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
