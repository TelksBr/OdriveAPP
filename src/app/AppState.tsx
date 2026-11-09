import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import type { AppAction, AppState, TabId } from './types';
import type { Locale } from '../i18n/messages';
import { APP_STORAGE_PREFIX } from './brand';
import { isDesktopApp } from '../features/serial/nativeSerialBridge';

function readStoredLocale(): Locale | null {
  const value = localStorage.getItem(`${APP_STORAGE_PREFIX}-locale`)
    ?? localStorage.getItem('odrive-wheel-locale');
  return value === 'en' || value === 'pt' ? value : null;
}

function readStoredAutoReconnect(): boolean {
  const value = localStorage.getItem(`${APP_STORAGE_PREFIX}-auto-reconnect`)
    ?? localStorage.getItem('odrive-wheel-auto-reconnect');
  return value !== 'false';
}

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const savedLocale = readStoredLocale();
const savedAutoReconnect = readStoredAutoReconnect();
const tabIds: TabId[] = ['dashboard', 'setup', 'calibration', 'motor', 'tune', 'ffb-test', 'perf-test', 'inputs', 'observe', 'maintain', 'commands', 'console', 'about'];

function initialTab(): TabId {
  const tab = new URLSearchParams(window.location.search).get('tab');
  return tabIds.includes(tab as TabId) ? (tab as TabId) : 'dashboard';
}

const initialState: AppState = {
  activeTab: initialTab(),
  locale: savedLocale ?? 'pt',
  connected: false,
  connecting: false,
  serialSupported: isDesktopApp() || ('serial' in navigator),
  hidSupported: isDesktopApp() || ('hid' in navigator),
  usbSupported: isDesktopApp() || ('usb' in navigator),
  busy: false,
  autoReconnect: savedAutoReconnect,
  reconnecting: false,
  dirtyPaths: [],
  nvmPending: false,
  nvmPendingPaths: [],
  fieldValues: {},
  logs: [],
  toasts: [],
};

const AppContext = createContext<AppContextValue | null>(null);

function reduceDirty(paths: string[], path: string, dirty: boolean): string[] {
  if (!dirty) {
    return paths.filter((item) => item !== path);
  }
  return paths.includes(path) ? paths : [...paths, path];
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'set-tab':
      return { ...state, activeTab: action.tab };
    case 'set-locale':
      return { ...state, locale: action.locale };
    case 'set-connected':
      return action.connected
        ? { ...state, connected: true, connecting: false, reconnecting: false }
        : { ...state, connected: false };
    case 'set-connecting':
      return {
        ...state,
        connecting: action.connecting,
        reconnecting: action.connecting ? false : state.reconnecting,
      };
    case 'set-busy':
      return { ...state, busy: action.busy };
    case 'set-auto-reconnect':
      return { ...state, autoReconnect: action.autoReconnect };
    case 'set-reconnecting':
      return {
        ...state,
        reconnecting: action.reconnecting && !state.connected && !state.connecting,
      };
    case 'set-capabilities':
      return {
        ...state,
        serialSupported: action.serialSupported ?? state.serialSupported,
        hidSupported: action.hidSupported ?? state.hidSupported,
        usbSupported: action.usbSupported ?? state.usbSupported,
      };
    case 'mark-refreshed':
      return { ...state, lastRefreshAt: new Date().toLocaleTimeString() };
    case 'set-field':
      return {
        ...state,
        fieldValues: { ...state.fieldValues, [action.path]: action.value },
        dirtyPaths: reduceDirty(state.dirtyPaths, action.path, action.dirty ?? true),
      };
    case 'hydrate-fields':
      return {
        ...state,
        fieldValues: { ...state.fieldValues, ...action.values },
        dirtyPaths: action.dirty ? [...new Set([...state.dirtyPaths, ...Object.keys(action.values)])] : state.dirtyPaths,
      };
    case 'clear-dirty':
      return { ...state, dirtyPaths: [], nvmPending: false, nvmPendingPaths: [] };
    case 'set-nvm-pending':
      return action.pending
        ? { ...state, nvmPending: true }
        : { ...state, nvmPending: false, nvmPendingPaths: [] };
    case 'mark-nvm-pending-path':
      return {
        ...state,
        nvmPending: true,
        nvmPendingPaths: state.nvmPendingPaths.includes(action.path)
          ? state.nvmPendingPaths
          : [...state.nvmPendingPaths, action.path],
      };
    case 'append-log':
      return {
        ...state,
        logs: [
          ...state.logs.slice(-199),
          {
            id: Date.now() + Math.floor(Math.random() * 1000),
            direction: action.direction,
            message: action.message,
            timestamp: new Date().toLocaleTimeString(),
          },
        ],
      };
    case 'clear-log':
      return { ...state, logs: [] };
    case 'push-toast': {
      const id = action.toast.id ?? `toast-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const item = {
        id,
        kind: action.toast.kind,
        message: action.toast.message,
        sub: action.toast.sub,
        progress: action.toast.progress,
        sticky: action.toast.sticky ?? false,
        createdAt: Date.now(),
      };
      const index = state.toasts.findIndex((t) => t.id === id);
      const toasts =
        index >= 0
          ? state.toasts.map((t, i) => (i === index ? { ...t, ...item, createdAt: t.createdAt } : t))
          : [...state.toasts.slice(-4), item];
      return { ...state, toasts };
    }
    case 'dismiss-toast':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    case 'focus-field':
      return { ...state, focusFieldPath: action.path };
    case 'clear-focus-field':
      return { ...state, focusFieldPath: undefined };
    default:
      return state;
  }
}

function tabUrl(tab: TabId): string {
  return tab === 'dashboard' ? window.location.pathname : `${window.location.pathname}?tab=${tab}`;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);

  useEffect(() => {
    window.history.replaceState(null, '', tabUrl(state.activeTab));
  }, [state.activeTab]);

  useEffect(() => {
    localStorage.setItem(`${APP_STORAGE_PREFIX}-locale`, state.locale);
  }, [state.locale]);

  useEffect(() => {
    localStorage.setItem(`${APP_STORAGE_PREFIX}-auto-reconnect`, String(state.autoReconnect));
  }, [state.autoReconnect]);

  useEffect(() => {
    function refreshCaps() {
      dispatch({
        type: 'set-capabilities',
        serialSupported: isDesktopApp() || ('serial' in navigator),
        hidSupported: isDesktopApp() || ('hid' in navigator),
        usbSupported: isDesktopApp() || ('usb' in navigator),
      });
    }
    window.addEventListener('focus', refreshCaps);
    return () => window.removeEventListener('focus', refreshCaps);
  }, []);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error('useAppState must be used inside AppStateProvider');
  }
  return value;
}

/** Safe locale read — works inside PiP / secondary React roots. */
export function useAppLocale(override?: Locale): Locale {
  if (override) {
    return override;
  }
  const value = useContext(AppContext);
  if (value) {
    return value.state.locale;
  }
  const saved = localStorage.getItem(`${APP_STORAGE_PREFIX}-locale`)
    ?? localStorage.getItem('odrive-wheel-locale');
  return saved === 'en' || saved === 'pt' ? saved : 'pt';
}
