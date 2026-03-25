import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { Material } from '@/types';
import type {
  MusicResumePayload,
  OpenMusicOptions,
  OpenMusicPlaybackIntent,
  RepertoirePlaybackIntent,
} from '@/utils/recentPlayback';

export type {
  MusicResumePayload,
  OpenMusicOptions,
  OpenMusicPlaybackIntent,
  RepertoirePlaybackIntent,
} from '@/utils/recentPlayback';

export type MusicPlayerViewer = 'member' | 'leader' | 'admin';

/** Hur spelläget för favoriter/bibliotek ska starta uppspelning */
export type LibraryPlaybackIntent =
  | 'browse'
  | 'playAll'
  | { type: 'fromIndex'; index: number };

export interface ActiveTrackMeta {
  title: string;
  artist?: string;
  /** S3 fileKey for the current track — used e.g. when favoriting from the mini player. */
  fileKey?: string;
}

/** För "Spår X av Y" i miniplayer (samma som inbäddad MediaPlayer). */
export interface PlaybackQueueMeta {
  currentIndex: number;
  total: number;
}

export interface MusicPlaybackApi {
  togglePlayPause: () => void;
  /** Maps to MediaPlayer goToPrevious */
  goPrevious: () => void;
  /** Maps to MediaPlayer goToNext */
  goNext: () => void;
  cycleRepeat: () => void;
  seek: (seconds: number) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (v: number) => void;
}

export interface PlaybackProgressSnapshot {
  current: number;
  duration: number;
}

interface MusicPlayerOverlayState {
  isOpen: boolean;
  groupName: string | null;
  viewer: MusicPlayerViewer | null;
  /** Globala material (t.ex. favoriter) – när satt körs spelläget utan repertoar-sidebar */
  libraryMaterials: Material[] | null;
  libraryPlayback: LibraryPlaybackIntent | null;
  /** Direktval av repertoar (normalt läge, sidebar kvar). */
  initialRepertoireId: string | null;
  initialPlaylistId: string | null;
  repertoirePlaybackIntent: RepertoirePlaybackIntent | null;
}

export interface MusicPlayerOverlayContextValue {
  open: (groupName: string, viewer: MusicPlayerViewer, options?: OpenMusicOptions) => void;
  /**
   * Öppnar musikspelaren med en fast lista material (hydrerade favoriter m.m.).
   * @param intent Standard browse (ingen auto-play). Sätt playAll / fromIndex för att starta uppspelning direkt.
   */
  openLibraryPlayer: (
    groupName: string,
    viewer: MusicPlayerViewer,
    materials: Material[],
    intent?: LibraryPlaybackIntent
  ) => void;
  /** Stänger fullskärms-UI men behåller session + uppspelning (miniplayer). */
  closeOverlay: () => void;
  /** Återställer hela musiksessionen (ingen miniplayer, inget ljud). */
  closeSession: () => void;
  /** Öppnar fullskärms-UI igen när en session redan finns. */
  expandOverlay: () => void;
  isOpen: boolean;
  activeGroupName: string | null;
  activeViewer: MusicPlayerViewer | null;
  libraryMaterials: Material[] | null;
  libraryPlayback: LibraryPlaybackIntent | null;
  initialRepertoireId: string | null;
  initialPlaylistId: string | null;
  repertoirePlaybackIntent: RepertoirePlaybackIntent | null;
  /** Rensa efter att panelen tillämpat initial repertoar + ev. uppspelningsintent. */
  clearInitialRepertoireLaunch: () => void;
  /** Aktuellt spår för miniplayer (synkas från MediaPlayer när syncPlaybackToContext). */
  activeTrack: ActiveTrackMeta | null;
  setActiveTrack: (t: ActiveTrackMeta | null) => void;
  isPlaying: boolean;
  setIsPlaying: (v: boolean) => void;
  /**
   * Uppdaterar tidslinje (anropas ofta under uppspelning).
   * Triggar inte omritning av konsumenter som bara prenumererar på session-kontexten.
   */
  setPlaybackProgress: (p: PlaybackProgressSnapshot) => void;
  /** Köposition (synkas från MediaPlayer). */
  queueMeta: PlaybackQueueMeta | null;
  setQueueMeta: (m: PlaybackQueueMeta | null) => void;
  repeatMode: 'off' | 'all' | 'one';
  setRepeatMode: (m: 'off' | 'all' | 'one') => void;
  volume: number;
  setVolume: (v: number) => void;
  playbackRate: number;
  setPlaybackRate: (r: number) => void;
  activeMaterialId: string | null;
  setActiveMaterialId: (id: string | null) => void;
  /** Imperativ styrning av samma MediaPlayer som är dold i miniläge. */
  playbackApiRef: React.MutableRefObject<MusicPlaybackApi | null>;
  /** @deprecated Använd playbackApiRef.current?.togglePlayPause */
  playbackToggleRef: React.MutableRefObject<(() => void) | null>;
  /** När open() anropas med resume – panelen ska välja repertoar/spellista och spela spåret. */
  pendingResume: MusicResumePayload | null;
  clearPendingResume: () => void;
}

export const MusicPlayerOverlayContext =
  createContext<MusicPlayerOverlayContextValue | null>(null);

/** Intern butik för tidslinje — undviker session context value-byte varje tick. */
const MusicPlayerProgressStoreContext = createContext<{
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => PlaybackProgressSnapshot;
} | null>(null);

const initialState: MusicPlayerOverlayState = {
  isOpen: false,
  groupName: null,
  viewer: null,
  libraryMaterials: null,
  libraryPlayback: null,
  initialRepertoireId: null,
  initialPlaylistId: null,
  repertoirePlaybackIntent: null,
};

function notifyListeners(set: Set<() => void>) {
  set.forEach((fn) => {
    fn();
  });
}

export function MusicPlayerOverlayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MusicPlayerOverlayState>(initialState);
  const [activeTrack, setActiveTrack] = useState<ActiveTrackMeta | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queueMeta, setQueueMeta] = useState<PlaybackQueueMeta | null>(null);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [activeMaterialId, setActiveMaterialId] = useState<string | null>(null);
  const playbackToggleRef = useRef<(() => void) | null>(null);
  const playbackApiRef = useRef<MusicPlaybackApi | null>(null);
  const [pendingResume, setPendingResume] = useState<MusicResumePayload | null>(null);

  const playbackProgressRef = useRef<PlaybackProgressSnapshot>({ current: 0, duration: 0 });
  const progressListenersRef = useRef(new Set<() => void>());

  const progressStore = useMemo(
    () => ({
      subscribe: (onChange: () => void) => {
        progressListenersRef.current.add(onChange);
        return () => {
          progressListenersRef.current.delete(onChange);
        };
      },
      getSnapshot: () => playbackProgressRef.current,
    }),
    []
  );

  const setPlaybackProgress = useCallback((p: PlaybackProgressSnapshot) => {
    const next = { current: p.current, duration: p.duration };
    const prev = playbackProgressRef.current;
    if (prev.current === next.current && prev.duration === next.duration) return;
    playbackProgressRef.current = next;
    notifyListeners(progressListenersRef.current);
  }, []);

  const clearPendingResume = useCallback(() => {
    setPendingResume(null);
  }, []);

  const clearInitialRepertoireLaunch = useCallback(() => {
    setState((s) => ({
      ...s,
      initialRepertoireId: null,
      initialPlaylistId: null,
      repertoirePlaybackIntent: null,
    }));
  }, []);

  const resetPlaybackMeta = useCallback(() => {
    setActiveTrack(null);
    setIsPlaying(false);
    playbackProgressRef.current = { current: 0, duration: 0 };
    notifyListeners(progressListenersRef.current);
    setQueueMeta(null);
    setRepeatMode('off');
    setVolume(1);
    setPlaybackRate(1);
    setActiveMaterialId(null);
    playbackToggleRef.current = null;
    playbackApiRef.current = null;
  }, []);

  const open = useCallback(
    (groupName: string, viewer: MusicPlayerViewer, options?: OpenMusicOptions) => {
      const g = groupName.trim();
      if (!g) return;
      resetPlaybackMeta();

      const browse = options?.playbackIntent === 'browse';
      const hasResume = Boolean(options?.resume);
      const bootRepId = options?.initialRepertoireId?.trim() || null;
      const bootPlId = options?.initialPlaylistId?.trim() || null;

      if (browse) {
        setPendingResume(null);
        if (hasResume && options?.resume) {
          const r = options.resume;
          if (r.source === 'repertoire') {
            setState({
              isOpen: options?.startMinimized ? false : true,
              groupName: g,
              viewer,
              libraryMaterials: null,
              libraryPlayback: null,
              initialRepertoireId: r.repertoireId,
              initialPlaylistId: null,
              repertoirePlaybackIntent: null,
            });
          } else {
            setState({
              isOpen: options?.startMinimized ? false : true,
              groupName: g,
              viewer,
              libraryMaterials: null,
              libraryPlayback: null,
              initialRepertoireId: null,
              initialPlaylistId: r.playlistId,
              repertoirePlaybackIntent: null,
            });
          }
          return;
        }
        setState({
          isOpen: options?.startMinimized ? false : true,
          groupName: g,
          viewer,
          libraryMaterials: null,
          libraryPlayback: null,
          initialRepertoireId: bootPlId ? null : bootRepId,
          initialPlaylistId: bootPlId,
          repertoirePlaybackIntent: null,
        });
        return;
      }

      setPendingResume(options?.resume ?? null);
      const intent = options?.playbackIntent as OpenMusicPlaybackIntent | undefined;
      let repPlayback: RepertoirePlaybackIntent | null = hasResume
        ? null
        : options?.repertoirePlayback ?? null;
      if (!hasResume && !repPlayback && intent === 'playAll' && bootRepId) {
        repPlayback = { type: 'fromIndex', index: 0 };
      }
      if (!hasResume && !repPlayback && intent && typeof intent === 'object') {
        repPlayback = intent;
      }

      setState({
        isOpen: options?.startMinimized ? false : true,
        groupName: g,
        viewer,
        libraryMaterials: null,
        libraryPlayback: null,
        initialRepertoireId: hasResume ? null : bootPlId ? null : bootRepId,
        initialPlaylistId: hasResume ? null : bootPlId,
        repertoirePlaybackIntent: repPlayback,
      });
    },
    [resetPlaybackMeta]
  );

  const openLibraryPlayer = useCallback(
    (
      groupName: string,
      viewer: MusicPlayerViewer,
      materials: Material[],
      intent: LibraryPlaybackIntent = 'browse'
    ) => {
      const g = groupName.trim();
      if (!g) return;
      const list = materials.filter((m) => m?.fileKey?.trim());
      if (list.length === 0) return;
      resetPlaybackMeta();
      setPendingResume(null);
      setState({
        isOpen: true,
        groupName: g,
        viewer,
        libraryMaterials: list,
        libraryPlayback: intent,
        initialRepertoireId: null,
        initialPlaylistId: null,
        repertoirePlaybackIntent: null,
      });
    },
    [resetPlaybackMeta]
  );

  const closeOverlay = useCallback(() => {
    setState((s) => {
      if (!s.groupName || !s.viewer) return s;
      return { ...s, isOpen: false };
    });
  }, []);

  const expandOverlay = useCallback(() => {
    setState((s) => {
      if (!s.groupName || !s.viewer) return s;
      return { ...s, isOpen: true };
    });
  }, []);

  const closeSession = useCallback(() => {
    setPendingResume(null);
    setState(initialState);
    resetPlaybackMeta();
  }, [resetPlaybackMeta]);

  const sessionValue = useMemo<MusicPlayerOverlayContextValue>(
    () => ({
      open,
      openLibraryPlayer,
      closeOverlay,
      closeSession,
      expandOverlay,
      isOpen: state.isOpen,
      activeGroupName: state.groupName,
      activeViewer: state.viewer,
      libraryMaterials: state.libraryMaterials,
      libraryPlayback: state.libraryPlayback,
      initialRepertoireId: state.initialRepertoireId,
      initialPlaylistId: state.initialPlaylistId,
      repertoirePlaybackIntent: state.repertoirePlaybackIntent,
      clearInitialRepertoireLaunch,
      activeTrack,
      setActiveTrack,
      isPlaying,
      setIsPlaying,
      setPlaybackProgress,
      queueMeta,
      setQueueMeta,
      repeatMode,
      setRepeatMode,
      volume,
      setVolume,
      playbackRate,
      setPlaybackRate,
      activeMaterialId,
      setActiveMaterialId,
      playbackApiRef,
      playbackToggleRef,
      pendingResume,
      clearPendingResume,
    }),
    [
      open,
      openLibraryPlayer,
      closeOverlay,
      closeSession,
      expandOverlay,
      clearInitialRepertoireLaunch,
      setPlaybackProgress,
      state.isOpen,
      state.groupName,
      state.viewer,
      state.libraryMaterials,
      state.libraryPlayback,
      state.initialRepertoireId,
      state.initialPlaylistId,
      state.repertoirePlaybackIntent,
      activeTrack,
      isPlaying,
      queueMeta,
      repeatMode,
      volume,
      playbackRate,
      activeMaterialId,
      pendingResume,
      clearPendingResume,
    ]
  );

  return (
    <MusicPlayerProgressStoreContext.Provider value={progressStore}>
      <MusicPlayerOverlayContext.Provider value={sessionValue}>{children}</MusicPlayerOverlayContext.Provider>
    </MusicPlayerProgressStoreContext.Provider>
  );
}

export function useMusicPlayerOverlay(): MusicPlayerOverlayContextValue {
  const ctx = useContext(MusicPlayerOverlayContext);
  if (!ctx) {
    throw new Error('useMusicPlayerOverlay must be used within MusicPlayerOverlayProvider');
  }
  return ctx;
}

/** För MediaPlayer m.m. – returnerar null om provider saknas (använd endast med sync-flagga). */
export function useOptionalMusicPlayerOverlay(): MusicPlayerOverlayContextValue | null {
  return useContext(MusicPlayerOverlayContext);
}

/**
 * Endast för UI som visar tidslinje (t.ex. MiniPlayerBar).
 * Prenumererar på progress utan att övriga useMusicPlayerOverlay-konsumenter renderas om varje tick.
 */
export function useMusicPlayerPlaybackProgress(): PlaybackProgressSnapshot {
  const store = useContext(MusicPlayerProgressStoreContext);
  if (!store) {
    throw new Error('useMusicPlayerPlaybackProgress must be used within MusicPlayerOverlayProvider');
  }
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => ({ current: 0, duration: 0 })
  );
}
