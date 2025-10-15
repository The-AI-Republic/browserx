export enum MessageType {
  DEFAULT = 'default',
  WARNING = 'warning',
  ERROR = 'error',
  INPUT = 'input',
  SYSTEM = 'system'
}

export interface TerminalTheme {
  backgroundColor: string;
  defaultTextColor: string;
  warningTextColor: string;
  errorTextColor: string;
  userInputColor: string;
  fontFamily: string;
  fontSize: string;
  lineHeight: number;
}

export const DEFAULT_TERMINAL_THEME: TerminalTheme = {
  backgroundColor: '#000000',
  defaultTextColor: '#00ff00',
  warningTextColor: '#ffff00',
  errorTextColor: '#ff0000',
  userInputColor: '#33ff00',
  fontFamily: 'Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
  fontSize: '14px',
  lineHeight: 1.5
};