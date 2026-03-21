import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type MusicPlayerViewer = 'member' | 'leader';

interface MusicPlayerOverlayState {
  isOpen: boolean;
  groupName: string | null;
  viewer: MusicPlayerViewer | null;
}

export interface MusicPlayerOverlayContextValue {
  open: (groupName: string, viewer: MusicPlayerViewer) => void;
  close: () => void;
  isOpen: boolean;
  activeGroupName: string | null;
  activeViewer: MusicPlayerViewer | null;
}

const MusicPlayerOverlayContext = createContext<MusicPlayerOverlayContextValue | null>(null);

const initialState: MusicPlayerOverlayState = {
  isOpen: false,
  groupName: null,
  viewer: null,
};

export function MusicPlayerOverlayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MusicPlayerOverlayState>(initialState);

  const open = useCallback((groupName: string, viewer: MusicPlayerViewer) => {
    const g = groupName.trim();
    if (!g) return;
    setState({ isOpen: true, groupName: g, viewer });
  }, []);

  const close = useCallback(() => {
    setState(initialState);
  }, []);

  const value = useMemo<MusicPlayerOverlayContextValue>(
    () => ({
      open,
      close,
      isOpen: state.isOpen,
      activeGroupName: state.groupName,
      activeViewer: state.viewer,
    }),
    [open, close, state.isOpen, state.groupName, state.viewer]
  );

  return (
    <MusicPlayerOverlayContext.Provider value={value}>{children}</MusicPlayerOverlayContext.Provider>
  );
}

export function useMusicPlayerOverlay(): MusicPlayerOverlayContextValue {
  const ctx = useContext(MusicPlayerOverlayContext);
  if (!ctx) {
    throw new Error('useMusicPlayerOverlay must be used within MusicPlayerOverlayProvider');
  }
  return ctx;
}
