import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import type { Material } from '@/types';
import { useAuth } from '@/context/AuthContext';
import {
  useMusicPlayerOverlay,
  type LibraryPlaybackIntent,
  type MusicPlayerViewer,
  type RepertoirePlaybackIntent,
} from '@/context/MusicPlayerOverlayContext';
import { useFavorites } from '@/hooks/useFavorites';
import { usePlaylists } from '@/hooks/usePlaylists';
import { getPlaylistItems, removePlaylistItem } from '@/services/musicService';
import type { MediaPlayerTrack } from '@/features/music-player/types';
import { buildMediaPlayerTracks } from '@/features/music-player/utils/buildMediaPlayerTracks';
import { hashTrackQueueKey } from '@/features/music-player/utils/hashTrackQueueKey';
import { saveRecentPlayback } from '@/utils/recentPlayback';
import { sortBySwedishTitle } from '@/utils/sortBySwedishTitle';
import { formatDisplayTitle, isPlayableAudioFile } from '@/utils/media';
import { getApiErrorMessage, isAbortError } from '@/utils/apiError';

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

export const LIBRARY_SELECTED_ID = '__library__';

export interface RepertoireItem {
  repertoireId: string;
  title: string;
  artist?: string;
}

export interface UseRepertoirePlaylistParams {
  groupName: string;
  viewer: MusicPlayerViewer;
  libraryQueueMaterials?: Material[] | null;
  libraryPlaybackIntent?: LibraryPlaybackIntent | null;
  libraryPlaybackWithRepertoire?: boolean;
  initialRepertoireId?: string | null;
  initialPlaylistId?: string | null;
  repertoirePlaybackIntent?: RepertoirePlaybackIntent | null;
  /** UI-krok när ett spår startas (stänger radmenyn). Anropas inte om vid omrendering. */
  onPlaybackStart?: () => void;
}

function playlistRequestError(error: unknown, fallback: string): string {
  if (isAbortError(error)) return fallback;
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    const serverMessage =
      data &&
      typeof data === 'object' &&
      'message' in data &&
      typeof (data as { message?: unknown }).message === 'string'
        ? (data as { message: string }).message.trim()
        : '';
    if (serverMessage) return getApiErrorMessage(error, fallback);
    return fallback;
  }
  return getApiErrorMessage(error, fallback);
}

/**
 * Repertoarer, spellistor och spelkö för musikpanelen.
 * Ett ökande requestId plus AbortController gör att ett äldre svar inte skriver över ett nyare val.
 */
export function useRepertoirePlaylist({
  groupName,
  libraryQueueMaterials = null,
  libraryPlaybackIntent = null,
  libraryPlaybackWithRepertoire = false,
  initialRepertoireId = null,
  initialPlaylistId = null,
  repertoirePlaybackIntent = null,
  onPlaybackStart,
}: UseRepertoirePlaylistParams) {
  const { getAuthHeaders } = useAuth();
  const { pendingResume, clearPendingResume, clearInitialRepertoireLaunch } =
    useMusicPlayerOverlay();
  const { favoriteMaterialIds, favoriteMaterials, toggleFavoriteOptimistic } = useFavorites();
  const {
    playlists,
    createNewPlaylist,
    renamePlaylist,
    deletePlaylist,
    isLoading: playlistsLoading,
    fetchPlaylists,
    error: playlistsHookError,
  } = usePlaylists();

  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [repertoires, setRepertoires] = useState<RepertoireItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerQueue, setPlayerQueue] = useState<MediaPlayerTrack[]>([]);
  const [playerStartIndex, setPlayerStartIndex] = useState(0);
  const [highlightedTrackIndex, setHighlightedTrackIndex] = useState(0);
  const [mobileCreatePlaylistOpen, setMobileCreatePlaylistOpen] = useState(false);

  const repertoireRequestRef = useRef(0);
  const materialsRequestRef = useRef(0);
  const materialsAbortRef = useRef<AbortController | null>(null);
  const queueBuildRef = useRef(0);
  const resumeAttemptKeyRef = useRef<string | null>(null);
  const repertoireBootstrapKeyRef = useRef<string | null>(null);
  const onPlaybackStartRef = useRef(onPlaybackStart);
  onPlaybackStartRef.current = onPlaybackStart;

  const sortedRepertoires = useMemo(
    () => sortBySwedishTitle(repertoires),
    [repertoires],
  );

  const hasLibraryPlaybackQueue = Boolean(libraryQueueMaterials?.length);
  const isStandaloneLibrarySession =
    hasLibraryPlaybackQueue && !libraryPlaybackWithRepertoire;

  const audioMaterials = useMemo(
    () => (materials || []).filter((m) => m.fileKey && isPlayableAudioFile(m.fileKey)),
    [materials],
  );

  const buildTracksFromMaterials = useCallback(
    async (items: Material[]): Promise<MediaPlayerTrack[]> => {
      return buildMediaPlayerTracks(items, getAuthHeaders());
    },
    [getAuthHeaders],
  );

  const mediaPlayerMountKey = useMemo(() => {
    if (hasLibraryPlaybackQueue && playerQueue.length > 0) {
      const sig = hashTrackQueueKey(playerQueue);
      return `lib-${groupName}-${sig}`;
    }
    if (!selectedId || playerQueue.length === 0) return 'idle';
    const sig = hashTrackQueueKey(playerQueue);
    return `${selectedId}-${sig}`;
  }, [hasLibraryPlaybackQueue, groupName, selectedId, playerQueue]);

  const persistProgressKey = useMemo(() => {
    if (hasLibraryPlaybackQueue) {
      if (libraryPlaybackWithRepertoire) {
        const ids = libraryQueueMaterials?.map((m) => m.materialId).join('-') ?? '';
        return `library-practice-${groupName}-${ids}`;
      }
      return `library-favorites-${groupName}`;
    }
    if (selectedId && selectedId !== LIBRARY_SELECTED_ID) {
      const isPlaylistSelection = playlists.some((p) => p.playlistId === selectedId);
      if (isPlaylistSelection) {
        return `grp-${groupName}-pl-${selectedId}`;
      }
      return `grp-${groupName}-rep-${selectedId}`;
    }
    return undefined;
  }, [
    hasLibraryPlaybackQueue,
    libraryPlaybackWithRepertoire,
    libraryQueueMaterials,
    groupName,
    selectedId,
    playlists,
  ]);

  const activePlaylist = playlists.find((p) => p.playlistId === selectedId) ?? null;

  useEffect(() => {
    if (isStandaloneLibrarySession) return;
    if (!groupName) return;

    const controller = new AbortController();
    const requestId = ++repertoireRequestRef.current;

    setLoadingList(true);
    setError(null);

    void (async () => {
      try {
        const res = await axios.get<RepertoireItem[]>(
          `${API_BASE_URL}/groups/${groupName}/repertoires`,
          { headers: { ...getAuthHeaders() }, signal: controller.signal },
        );
        if (requestId !== repertoireRequestRef.current) return;
        setRepertoires(res.data ?? []);
      } catch (e) {
        if (isAbortError(e) || requestId !== repertoireRequestRef.current) return;
        console.error(e);
        setError(playlistRequestError(e, 'Kunde inte hämta repertoaren.'));
      } finally {
        if (requestId === repertoireRequestRef.current) setLoadingList(false);
      }
    })();

    return () => {
      repertoireRequestRef.current += 1;
      controller.abort();
    };
  }, [isStandaloneLibrarySession, groupName, getAuthHeaders]);

  const beginMaterialsRequest = useCallback(() => {
    materialsAbortRef.current?.abort();
    const controller = new AbortController();
    materialsAbortRef.current = controller;
    const requestId = ++materialsRequestRef.current;
    return { controller, requestId };
  }, []);

  const fetchMaterials = useCallback(
    async (repertoireId: string) => {
      if (!groupName) return;
      const { controller, requestId } = beginMaterialsRequest();
      setLoadingTracks(true);
      setError(null);
      try {
        const res = await axios.get<Material[]>(
          `${API_BASE_URL}/groups/${groupName}/repertoires/${repertoireId}/materials`,
          { headers: { ...getAuthHeaders() }, signal: controller.signal },
        );
        if (requestId !== materialsRequestRef.current) return;
        setMaterials(res.data ?? []);
      } catch (e) {
        if (isAbortError(e) || requestId !== materialsRequestRef.current) return;
        console.error(e);
        setError(playlistRequestError(e, 'Kunde inte hämta ljudfiler för låten.'));
        setMaterials([]);
      } finally {
        if (requestId === materialsRequestRef.current) setLoadingTracks(false);
      }
    },
    [groupName, getAuthHeaders, beginMaterialsRequest],
  );

  const fetchPlaylistMaterials = useCallback(async (playlistId: string) => {
    const items = await getPlaylistItems(playlistId);
    return items.map((row) => row.material);
  }, []);

  const handleSelectPlaylist = useCallback(
    async (playlistId: string) => {
      const id = playlistId?.trim();
      if (!id) return;
      const { requestId } = beginMaterialsRequest();
      setSelectedId(id);
      setPlayerQueue([]);
      setLoadingTracks(true);
      setError(null);
      try {
        const mats = await fetchPlaylistMaterials(id);
        if (requestId !== materialsRequestRef.current) return;
        setMaterials(mats);
      } catch (e) {
        if (requestId !== materialsRequestRef.current) return;
        console.error(e);
        setError(playlistRequestError(e, 'Kunde inte hämta spellistan.'));
        setMaterials([]);
      } finally {
        if (requestId === materialsRequestRef.current) setLoadingTracks(false);
      }
    },
    [beginMaterialsRequest, fetchPlaylistMaterials],
  );

  const handleSelectRepertoire = useCallback(
    (id: string) => {
      setSelectedId(id);
      setPlayerQueue([]);
      void fetchMaterials(id);
    },
    [fetchMaterials],
  );

  useEffect(() => {
    if (!libraryQueueMaterials?.length) return;

    setMaterials(libraryQueueMaterials);
    setSelectedId(LIBRARY_SELECTED_ID);
    setLoadingList(false);
    setLoadingTracks(false);
    setError(null);
    if (!libraryPlaybackWithRepertoire) {
      setRepertoires([]);
    }

    const intent: LibraryPlaybackIntent = libraryPlaybackIntent ?? 'browse';
    const requestId = ++queueBuildRef.current;
    let cancelled = false;

    void buildTracksFromMaterials(libraryQueueMaterials).then((tracks) => {
      if (cancelled || requestId !== queueBuildRef.current) return;

      if (tracks.length === 0 || intent === 'browse') {
        setPlayerQueue([]);
        return;
      }

      if (intent === 'playAll') {
        setPlayerStartIndex(0);
        setHighlightedTrackIndex(0);
        setPlayerQueue(tracks);
        return;
      }

      if (intent.type === 'fromIndex') {
        const safe = Math.min(Math.max(0, intent.index), tracks.length - 1);
        setPlayerStartIndex(safe);
        setHighlightedTrackIndex(safe);
        setPlayerQueue(tracks);
      }
    });

    return () => {
      cancelled = true;
      queueBuildRef.current += 1;
    };
  }, [
    libraryQueueMaterials,
    libraryPlaybackIntent,
    libraryPlaybackWithRepertoire,
    buildTracksFromMaterials,
  ]);

  const resolvedPlayerStartIndex = useMemo(() => {
    const rid = initialRepertoireId?.trim();
    if (!repertoirePlaybackIntent || !rid || selectedId !== rid || audioMaterials.length === 0) {
      return playerStartIndex;
    }
    if (repertoirePlaybackIntent.type === 'fromMaterialId') {
      const idx = audioMaterials.findIndex(
        (m) => m.materialId === repertoirePlaybackIntent.materialId,
      );
      return idx >= 0 ? idx : playerStartIndex;
    }
    return Math.min(
      Math.max(0, repertoirePlaybackIntent.index),
      audioMaterials.length - 1,
    );
  }, [repertoirePlaybackIntent, initialRepertoireId, selectedId, audioMaterials, playerStartIndex]);

  const handlePlayTrackAt = useCallback(
    (index: number) => {
      onPlaybackStartRef.current?.();
      const playable = materials.filter((m) => m.fileKey && isPlayableAudioFile(m.fileKey));
      if (playable.length > 0) {
        const safeIndex = Math.min(Math.max(0, index), playable.length - 1);
        setPlayerStartIndex(safeIndex);
        setHighlightedTrackIndex(safeIndex);
      }
      const requestId = ++queueBuildRef.current;
      void buildTracksFromMaterials(playable).then((tracks) => {
        if (requestId !== queueBuildRef.current) return;
        if (tracks.length === 0) return;
        const safeIndex = Math.min(Math.max(0, index), tracks.length - 1);
        setPlayerStartIndex(safeIndex);
        setHighlightedTrackIndex(safeIndex);
        setPlayerQueue(tracks);
      });
    },
    [buildTracksFromMaterials, materials],
  );

  const handlePlayFavorites = useCallback(() => {
    const playable = favoriteMaterials.filter(
      (m) => m.fileKey && isPlayableAudioFile(m.fileKey),
    );
    setSelectedId(LIBRARY_SELECTED_ID);
    setMaterials(playable);
    setPlayerQueue([]);
    setPlayerStartIndex(0);
    setHighlightedTrackIndex(0);
  }, [favoriteMaterials]);

  const clearSelection = useCallback(() => {
    materialsAbortRef.current?.abort();
    materialsRequestRef.current += 1;
    queueBuildRef.current += 1;
    setSelectedId(null);
    setMaterials([]);
    setPlayerQueue([]);
    setPlayerStartIndex(0);
    setHighlightedTrackIndex(0);
  }, []);

  const handleCreatePlaylistInSidebar = async () => {
    const title = newPlaylistTitle.trim();
    if (!title) return;
    setCreatingPlaylist(true);
    try {
      await createNewPlaylist(title);
      setNewPlaylistTitle('');
    } catch {
      // error handled in usePlaylists
    } finally {
      setCreatingPlaylist(false);
    }
  };

  const handleCreatePlaylistMobile = async () => {
    const title = newPlaylistTitle.trim();
    if (!title) return;
    setCreatingPlaylist(true);
    try {
      await createNewPlaylist(title);
      setNewPlaylistTitle('');
      setMobileCreatePlaylistOpen(false);
    } catch {
      // error handled in usePlaylists
    } finally {
      setCreatingPlaylist(false);
    }
  };

  const handleRemoveFromPlaylist = useCallback(
    async (materialId: string) => {
      const sid = selectedId?.trim();
      if (!sid) return;
      try {
        await removePlaylistItem(sid, materialId);
        setMaterials((prev) => prev.filter((m) => m.materialId !== materialId));
        setPlayerQueue((prev) => prev.filter((t) => t.materialId !== materialId));
      } catch (e) {
        console.error('handleRemoveFromPlaylist failed', e);
      }
    },
    [selectedId],
  );

  useEffect(() => {
    if (!groupName?.trim() || isStandaloneLibrarySession) return;
    if (!selectedId || selectedId === LIBRARY_SELECTED_ID) return;
    if (playerQueue.length === 0) return;
    const isPlaylist = playlists.some((p) => p.playlistId === selectedId);
    const m = audioMaterials[highlightedTrackIndex];
    if (!m?.materialId) return;
    const title =
      formatDisplayTitle(
        (m.title && String(m.title).trim()) || (m.fileKey && m.fileKey.split('/').pop()) || '',
      ) || 'Okänt spår';
    if (isPlaylist) {
      saveRecentPlayback({
        groupSlug: groupName.trim(),
        kind: 'playlist',
        playlistId: selectedId,
        materialId: m.materialId,
        title,
      });
    } else {
      saveRecentPlayback({
        groupSlug: groupName.trim(),
        kind: 'repertoire',
        repertoireId: selectedId,
        materialId: m.materialId,
        title,
      });
    }
  }, [
    groupName,
    isStandaloneLibrarySession,
    selectedId,
    playlists,
    playerQueue.length,
    audioMaterials,
    highlightedTrackIndex,
  ]);

  useEffect(() => {
    if (!pendingResume) {
      resumeAttemptKeyRef.current = null;
    }
  }, [pendingResume]);

  useEffect(() => {
    if (!pendingResume || isStandaloneLibrarySession) return;

    const key =
      pendingResume.source === 'repertoire'
        ? `rep:${pendingResume.repertoireId}:${pendingResume.materialId}`
        : `pl:${pendingResume.playlistId}:${pendingResume.materialId}`;

    if (resumeAttemptKeyRef.current === key) return;

    if (pendingResume.source === 'repertoire') {
      const { repertoireId, materialId } = pendingResume;
      if (selectedId !== repertoireId) {
        handleSelectRepertoire(repertoireId);
        return;
      }
      if (loadingTracks) return;
      const idx = audioMaterials.findIndex((m) => m.materialId === materialId);
      if (idx >= 0) {
        handlePlayTrackAt(idx);
        clearPendingResume();
        resumeAttemptKeyRef.current = key;
      } else {
        clearPendingResume();
        resumeAttemptKeyRef.current = key;
      }
      return;
    }

    const { playlistId, materialId } = pendingResume;
    if (selectedId !== playlistId) {
      void handleSelectPlaylist(playlistId);
      return;
    }
    if (loadingTracks) return;
    const idx = audioMaterials.findIndex((m) => m.materialId === materialId);
    if (idx >= 0) {
      handlePlayTrackAt(idx);
      clearPendingResume();
      resumeAttemptKeyRef.current = key;
    } else {
      clearPendingResume();
      resumeAttemptKeyRef.current = key;
    }
  }, [
    pendingResume,
    isStandaloneLibrarySession,
    selectedId,
    loadingTracks,
    audioMaterials,
    clearPendingResume,
    handleSelectPlaylist,
    handleSelectRepertoire,
    handlePlayTrackAt,
  ]);

  useEffect(() => {
    if (!initialRepertoireId?.trim() && !initialPlaylistId?.trim()) {
      repertoireBootstrapKeyRef.current = null;
    }
  }, [initialRepertoireId, initialPlaylistId]);

  useEffect(() => {
    if (isStandaloneLibrarySession || pendingResume) return;
    const rid = initialRepertoireId?.trim();
    const plid = initialPlaylistId?.trim();
    if (!rid && !plid) return;

    const isPlaylistBootstrap = Boolean(plid);
    const targetId = isPlaylistBootstrap ? plid! : rid!;

    const keyBase = repertoirePlaybackIntent
      ? `${targetId}:${isPlaylistBootstrap ? 'pl' : 'rep'}:${repertoirePlaybackIntent.type}:${
          repertoirePlaybackIntent.type === 'fromMaterialId'
            ? repertoirePlaybackIntent.materialId
            : String(repertoirePlaybackIntent.index)
        }`
      : `${targetId}:${isPlaylistBootstrap ? 'pl' : 'rep'}:browse`;

    if (selectedId !== targetId) {
      if (isPlaylistBootstrap) void handleSelectPlaylist(targetId);
      else handleSelectRepertoire(targetId);
      return;
    }

    if (loadingTracks) return;

    if (!repertoirePlaybackIntent) {
      if (repertoireBootstrapKeyRef.current !== keyBase) {
        clearInitialRepertoireLaunch();
        repertoireBootstrapKeyRef.current = keyBase;
      }
      return;
    }

    if (repertoireBootstrapKeyRef.current === keyBase) return;

    if (audioMaterials.length === 0) {
      clearInitialRepertoireLaunch();
      repertoireBootstrapKeyRef.current = keyBase;
      return;
    }

    if (repertoirePlaybackIntent.type === 'fromMaterialId') {
      const idx = audioMaterials.findIndex(
        (m) => m.materialId === repertoirePlaybackIntent.materialId,
      );
      if (idx >= 0) {
        handlePlayTrackAt(idx);
      }
    } else {
      const safe = Math.min(
        Math.max(0, repertoirePlaybackIntent.index),
        audioMaterials.length - 1,
      );
      handlePlayTrackAt(safe);
    }
    clearInitialRepertoireLaunch();
    repertoireBootstrapKeyRef.current = keyBase;
  }, [
    isStandaloneLibrarySession,
    pendingResume,
    initialRepertoireId,
    initialPlaylistId,
    repertoirePlaybackIntent,
    selectedId,
    loadingTracks,
    audioMaterials,
    clearInitialRepertoireLaunch,
    handleSelectPlaylist,
    handleSelectRepertoire,
    handlePlayTrackAt,
  ]);

  useEffect(() => {
    return () => {
      materialsRequestRef.current += 1;
      materialsAbortRef.current?.abort();
    };
  }, []);

  return {
    repertoires,
    sortedRepertoires,
    playlists,
    playlistsLoading,
    playlistsHookError,
    fetchPlaylists,
    activePlaylist,
    selectedId,
    activePlaylistId: selectedId,
    materials,
    playerQueue,
    activeQueue: playerQueue,
    playerStartIndex: resolvedPlayerStartIndex,
    highlightedTrackIndex,
    setHighlightedTrackIndex,
    loadingList,
    loadingTracks,
    isLoading: loadingList || loadingTracks || playlistsLoading,
    error,
    audioMaterials,
    mediaPlayerMountKey,
    persistProgressKey,
    hasLibraryPlaybackQueue,
    isStandaloneLibrarySession,
    favoriteMaterialIds,
    favoriteMaterials,
    toggleFavorite: toggleFavoriteOptimistic,
    toggleFavoriteOptimistic,
    newPlaylistTitle,
    setNewPlaylistTitle,
    creatingPlaylist,
    mobileCreatePlaylistOpen,
    setMobileCreatePlaylistOpen,
    selectRepertoire: handleSelectRepertoire,
    selectPlaylist: handleSelectPlaylist,
    handleSelectRepertoire,
    handleSelectPlaylist,
    handlePlayTrackAt,
    handlePlayFavorites,
    createPlaylist: createNewPlaylist,
    handleCreatePlaylistInSidebar,
    handleCreatePlaylistMobile,
    deletePlaylist,
    renamePlaylist,
    clearSelection,
    handleRemoveFromPlaylist,
  };
}
