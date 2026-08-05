// Detect if running inside Electron
export const isElectron = (): boolean =>
  typeof window !== 'undefined' && !!(window as any).electronAPI;

export const electronAPI = (): { minimize: () => void; close: () => void } | null =>
  isElectron() ? (window as any).electronAPI : null;
