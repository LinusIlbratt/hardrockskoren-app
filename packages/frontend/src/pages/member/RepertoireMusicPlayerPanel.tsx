import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Music,
  Play,
  ChevronLeft,
  X,
  Disc3,
  Heart,
  ListPlus,
  Plus,
  Trash2,
} from 'lucide-react';
import { MediaPlayer, type MediaPlayerTrack } from '@/components/media/MediaPlayer';
import type { Material } from '@/types';
import {
  useMusicPlayerOverlay,
  type LibraryPlaybackIntent,
  type MusicPlayerViewer,
  type RepertoirePlaybackIntent,
} from '@/context/MusicPlayerOverlayContext';
import { useAuth } from '@/context/AuthContext';
import { saveRecentPlayback } from '@/utils/recentPlayback';
import { hashMediaSourcesKey, isPlayableAudioFile } from '@/utils/media';
import { useFavorites } from '@/hooks/useFavorites';
import { usePlaylists } from '@/hooks/usePlaylists';
import { getPlaylistItems, addPlaylistItem, removePlaylistItem } from '@/services/musicService';
import styles from './RepertoireMusicPlayerPage.module.scss';

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;
const FILE_BASE_URL = import.meta.env.VITE_S3_BUCKET_URL;

const LIBRARY_SELECTED_ID = '__library__';

interface RepertoireItem {
  repertoireId: string;
  title: string;
  artist?: string;
}

export interface RepertoireMusicPlayerPanelProps {
  groupName: string;
  viewer: MusicPlayerViewer;
  /** Stänger endast fullskärm (miniplayer fortsätter). */
  onMinimizeOverlay: () => void;
  /** Avslutar musiksession helt (t.ex. navigera tillbaka till repertoar). */
  onExitSession: () => void;
  shellTitleId?: string;
  /** Spelläge: favoriter / bibliotek utan repertoar-sidebar */
  libraryQueueMaterials?: Material[] | null;
  libraryPlaybackIntent?: LibraryPlaybackIntent | null;
  /** Direkt öppning av repertoar (normalt läge — sidebar "Repertoar" synlig). */
  initialRepertoireId?: string | null;
  initialPlaylistId?: string | null;
  repertoirePlaybackIntent?: RepertoirePlaybackIntent | null;
}

export function RepertoireMusicPlayerPanel({
  groupName,
  viewer,
  onMinimizeOverlay,
  onExitSession,
  shellTitleId,
  libraryQueueMaterials = null,
  libraryPlaybackIntent = null,
  initialRepertoireId = null,
  initialPlaylistId = null,
  repertoirePlaybackIntent = null,
}: RepertoireMusicPlayerPanelProps) {
  const navigate = useNavigate();
  const { getAuthHeaders } = useAuth();
  const { pendingResume, clearPendingResume, clearInitialRepertoireLaunch } =
    useMusicPlayerOverlay();
  const { favoriteMaterialIds, favoriteMaterials, toggleFavoriteOptimistic } = useFavorites();
  const {
    playlists,
    createNewPlaylist,
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
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [playlistAddBusyId, setPlaylistAddBusyId] = useState<string | null>(null);
  const [playlistAddError, setPlaylistAddError] = useState<string | null>(null);
  const resumeAttemptKeyRef = useRef<string | null>(null);
  const repertoireBootstrapKeyRef = useRef<string | null>(null);

  const isLibraryMode = Boolean(libraryQueueMaterials?.length);

  const repertoiresHref = useMemo(() => {
    if (!groupName) return '/';
    return viewer === 'leader'
      ? `/leader/choir/${groupName}/repertoires`
      : `/user/me/${groupName}/repertoires`;
  }, [groupName, viewer]);

  const audioMaterials = useMemo(
    () =>
      (materials || []).filter((m) => m.fileKey && isPlayableAudioFile(m.fileKey)),
    [materials]
  );

  const buildTracksFromMaterials = useCallback((items: Material[]): MediaPlayerTrack[] => {
    return items
      .filter((m) => m.fileKey && isPlayableAudioFile(m.fileKey))
      .map((m) => ({
        src: `${FILE_BASE_URL}/${m.fileKey}`,
        title: m.title || m.fileKey?.split('/').pop() || 'Okänd',
        materialId: m.materialId,
      }));
  }, []);

  const mediaPlayerMountKey = useMemo(() => {
    if (isLibraryMode && playerQueue.length > 0) {
      const sig = hashMediaSourcesKey(playerQueue.map((t) => t.src));
      return `lib-${groupName}-${playerStartIndex}-${sig}`;
    }
    if (!selectedId || playerQueue.length === 0) return 'idle';
    const sig = hashMediaSourcesKey(playerQueue.map((t) => t.src));
    return `${selectedId}-${playerStartIndex}-${sig}`;
  }, [isLibraryMode, groupName, selectedId, playerStartIndex, playerQueue]);

  const persistProgressKey = useMemo(() => {
    if (isLibraryMode) {
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
  }, [isLibraryMode, groupName, selectedId, playlists]);

  const fetchRepertoires = useCallback(async () => {
    if (!groupName) return;
    setLoadingList(true);
    setError(null);
    try {
      const res = await axios.get<RepertoireItem[]>(
        `${API_BASE_URL}/groups/${groupName}/repertoires`,
        { headers: { ...getAuthHeaders() } }
      );
      setRepertoires(res.data ?? []);
    } catch (e) {
      console.error(e);
      setError('Kunde inte hämta repertoaren.');
    } finally {
      setLoadingList(false);
    }
  }, [groupName, getAuthHeaders]);

  useEffect(() => {
    if (isLibraryMode) return;
    fetchRepertoires();
  }, [isLibraryMode, fetchRepertoires]);

  const fetchMaterials = useCallback(
    async (repertoireId: string) => {
      if (!groupName) return;
      setLoadingTracks(true);
      setError(null);
      try {
        const res = await axios.get<Material[]>(
          `${API_BASE_URL}/groups/${groupName}/repertoires/${repertoireId}/materials`,
          { headers: { ...getAuthHeaders() } }
        );
        setMaterials(res.data ?? []);
      } catch (e) {
        console.error(e);
        setError('Kunde inte hämta ljudfiler för låten.');
        setMaterials([]);
      } finally {
        setLoadingTracks(false);
      }
    },
    [groupName, getAuthHeaders]
  );

  /** Hydrerade material för en spellista (music-api GET /playlists/{id}/items). */
  const fetchPlaylistMaterials = useCallback(async (playlistId: string) => {
    const items = await getPlaylistItems(playlistId);
    return items.map((row) => row.material);
  }, []);

  const handleSelectPlaylist = useCallback(
    async (playlistId: string) => {
      const id = playlistId?.trim();
      if (!id) return;
      setSelectedId(id);
      setPlayerQueue([]);
      setLoadingTracks(true);
      setError(null);
      try {
        const mats = await fetchPlaylistMaterials(id);
        setMaterials(mats);
      } catch (e) {
        console.error(e);
        setError('Kunde inte hämta spellistan.');
        setMaterials([]);
      } finally {
        setLoadingTracks(false);
      }
    },
    [fetchPlaylistMaterials]
  );

  const handleSelectRepertoire = (id: string) => {
    setSelectedId(id);
    setPlayerQueue([]);
    fetchMaterials(id);
  };

  useEffect(() => {
    if (!libraryQueueMaterials?.length) return;

    setMaterials(libraryQueueMaterials);
    setSelectedId(LIBRARY_SELECTED_ID);
    setLoadingList(false);
    setLoadingTracks(false);
    setError(null);
    setRepertoires([]);

    const tracks = buildTracksFromMaterials(libraryQueueMaterials);
    const intent: LibraryPlaybackIntent = libraryPlaybackIntent ?? 'playAll';

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
  }, [libraryQueueMaterials, libraryPlaybackIntent, buildTracksFromMaterials]);

  const handlePlayTrackAt = (index: number) => {
    const tracks = buildTracksFromMaterials(
      materials.filter((m) => m.fileKey && isPlayableAudioFile(m.fileKey))
    );
    if (tracks.length === 0) return;
    const safeIndex = Math.min(Math.max(0, index), tracks.length - 1);
    setPlayerStartIndex(safeIndex);
    setHighlightedTrackIndex(safeIndex);
    setPlayerQueue(tracks);
  };

  const handlePlayAll = () => {
    if (audioMaterials.length === 0) return;
    handlePlayTrackAt(0);
  };

  const handleToRepertoires = () => {
    if (isLibraryMode && viewer === 'member') {
      navigate(`/user/me/${groupName}/library`);
    } else {
      navigate(repertoiresHref);
    }
    onExitSession();
  };

  const handlePlayFavorites = () => {
    const playable = favoriteMaterials.filter(
      (m) => m.fileKey && isPlayableAudioFile(m.fileKey)
    );
    setSelectedId(LIBRARY_SELECTED_ID);
    setMaterials(playable);
    if (playable.length === 0) {
      setPlayerQueue([]);
      return;
    }
    const tracks = buildTracksFromMaterials(playable);
    setPlayerStartIndex(0);
    setHighlightedTrackIndex(0);
    setPlayerQueue(tracks);
  };

  const handleCreatePlaylistInSidebar = async () => {
    const title = newPlaylistTitle.trim();
    if (!title) return;
    setCreatingPlaylist(true);
    try {
      await createNewPlaylist(title);
      setNewPlaylistTitle('');
    } catch {
      // error handled in hook
    } finally {
      setCreatingPlaylist(false);
    }
  };

  const isCurrentViewPlaylist = playlists.some((p) => p.playlistId === selectedId);

  useEffect(() => {
    if (!groupName?.trim() || isLibraryMode) return;
    if (!selectedId || selectedId === LIBRARY_SELECTED_ID) return;
    if (playerQueue.length === 0) return;
    const isPlaylist = playlists.some((p) => p.playlistId === selectedId);
    const m = audioMaterials[highlightedTrackIndex];
    if (!m?.materialId) return;
    const title =
      (m.title && String(m.title).trim()) ||
      (m.fileKey && m.fileKey.split('/').pop()) ||
      'Okänt spår';
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
    isLibraryMode,
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
    if (!pendingResume || isLibraryMode) return;

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
    isLibraryMode,
    selectedId,
    loadingTracks,
    audioMaterials,
    clearPendingResume,
    handleSelectPlaylist,
  ]);

  useEffect(() => {
    if (!initialRepertoireId?.trim() && !initialPlaylistId?.trim()) {
      repertoireBootstrapKeyRef.current = null;
    }
  }, [initialRepertoireId, initialPlaylistId]);

  /**
   * Välj repertoar eller spellista direkt (inte library mode). Valfritt: spela spår när material laddats.
   * Körs inte när pendingResume eller library-läge är aktivt.
   */
  useEffect(() => {
    if (isLibraryMode || pendingResume) return;
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
        (m) => m.materialId === repertoirePlaybackIntent.materialId
      );
      if (idx >= 0) {
        handlePlayTrackAt(idx);
      }
    } else {
      const safe = Math.min(
        Math.max(0, repertoirePlaybackIntent.index),
        audioMaterials.length - 1
      );
      handlePlayTrackAt(safe);
    }
    clearInitialRepertoireLaunch();
    repertoireBootstrapKeyRef.current = keyBase;
  }, [
    isLibraryMode,
    pendingResume,
    initialRepertoireId,
    initialPlaylistId,
    repertoirePlaybackIntent,
    selectedId,
    loadingTracks,
    audioMaterials,
    clearInitialRepertoireLaunch,
    handleSelectPlaylist,
  ]);

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
    [selectedId]
  );

  useEffect(() => {
    if (!activeDropdownId) return;
    setPlaylistAddError(null);
    void fetchPlaylists();
  }, [activeDropdownId, fetchPlaylists]);

  const selectedPlaylistTitle = playlists.find((p) => p.playlistId === selectedId)?.title;
  const selectedRepertoireTitle = repertoires.find((r) => r.repertoireId === selectedId)?.title;
  const selectedTitle = isLibraryMode
    ? 'Mina favoriter'
    : selectedPlaylistTitle ?? selectedRepertoireTitle;

  const shellBodyClass = [
    styles.shellBody,
    isLibraryMode ? styles.shellBodyLibrary : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.musicShell}>
      {/* ── top bar ── */}
      <header className={styles.shellTop}>
        <div className={styles.shellTopLeft}>
          <span className={styles.shellBrand} aria-hidden>HRK</span>
          <span id={shellTitleId} className={styles.shellBrandTitle}>Musik</span>
        </div>
        <div className={styles.shellTopRight}>
          <button type="button" className={styles.backLink} onClick={handleToRepertoires}>
            <ChevronLeft size={16} aria-hidden />
            {isLibraryMode ? 'Mitt bibliotek' : 'Repertoar'}
          </button>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onMinimizeOverlay}
            aria-label="Stäng musik"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
      </header>

      {/* ── body ── */}
      <div className={shellBodyClass}>
        {/* ── playlist sidebar (left) ── */}
        <aside className={styles.playlistSidebar} aria-label="Dina spellistor">
          <h2 className={styles.playlistSidebarTitle}>Mitt bibliotek</h2>

          <div className={styles.playlistSidebarSection}>
            <p className={styles.playlistSidebarSectionLabel}>Favoriter</p>
            <ul className={styles.playlistSidebarList}>
              <li>
                <button
                  type="button"
                  className={`${styles.playlistSidebarItem} ${isLibraryMode ? styles.playlistSidebarItemActive : ''}`}
                  onClick={handlePlayFavorites}
                >
                  <Heart size={14} className={styles.playlistSidebarItemIcon} aria-hidden />
                  <span className={styles.playlistSidebarItemLabel}>
                    Favoriter ({favoriteMaterials.filter(m => m.fileKey && isPlayableAudioFile(m.fileKey)).length})
                  </span>
                </button>
              </li>
            </ul>
          </div>

          <div className={styles.playlistSidebarSection}>
            <p className={styles.playlistSidebarSectionLabel}>Spellistor</p>
            <ul className={styles.playlistSidebarList}>
              {playlistsLoading ? (
                <li><p className={styles.muted}>Laddar…</p></li>
              ) : playlists.length === 0 ? (
                <li><p className={styles.muted}>Inga spellistor ännu.</p></li>
              ) : (
                playlists.map((p) => (
                  <li key={p.playlistId}>
                    <button
                      type="button"
                      className={`${styles.playlistSidebarItem} ${selectedId === p.playlistId ? styles.playlistSidebarItemActive : ''}`}
                      onClick={() => {
                        void handleSelectPlaylist(p.playlistId);
                      }}
                    >
                      <ListPlus size={14} className={styles.playlistSidebarItemIcon} aria-hidden />
                      <span className={styles.playlistSidebarItemLabel}>{p.title}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className={styles.playlistSidebarCreate}>
            <div className={styles.playlistSidebarCreateRow}>
              <input
                type="text"
                className={styles.playlistSidebarInput}
                placeholder="Ny spellista…"
                value={newPlaylistTitle}
                onChange={(e) => setNewPlaylistTitle(e.target.value)}
                disabled={creatingPlaylist}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreatePlaylistInSidebar();
                }}
              />
              <button
                type="button"
                className={styles.playlistSidebarCreateButton}
                onClick={() => void handleCreatePlaylistInSidebar()}
                disabled={creatingPlaylist || !newPlaylistTitle.trim()}
                aria-label="Skapa spellista"
              >
                <Plus size={16} aria-hidden />
              </button>
            </div>
          </div>
        </aside>

        {/* ── main ── */}
        <section className={styles.shellMain} aria-label="Spår och uppspelning">
          {!selectedId && !isLibraryMode ? (
            /* ── welcome state ── */
            <div className={styles.emptyMain}>
              <Disc3 size={64} className={styles.emptyIcon} aria-hidden />
              <h2 className={styles.emptyTitle}>Välkommen till musikspelaren</h2>
              <p className={styles.emptyDescription}>
                Välj en låt i biblioteket till vänster för att lyssna på körens ljudfiler.
              </p>
            </div>
          ) : !selectedId && isLibraryMode ? (
            <p className={styles.muted}>Laddar bibliotek…</p>
          ) : loadingTracks ? (
            <p className={styles.muted}>Laddar spår...</p>
          ) : (
            <>
              {/* hero */}
              <div className={styles.hero}>
                <div className={styles.heroArt} aria-hidden>
                  {(selectedTitle || '?').charAt(0).toUpperCase()}
                </div>
                <div className={styles.heroText}>
                  <p className={styles.heroEyebrow}>
                    {isLibraryMode
                      ? 'Mitt bibliotek'
                      : selectedPlaylistTitle
                        ? 'Spellista'
                        : 'Repertoar'}
                  </p>
                  <h1 className={styles.heroTitle}>{selectedTitle}</h1>
                  <p className={styles.heroMeta}>
                    {audioMaterials.length}{' '}
                    {audioMaterials.length === 1 ? 'ljudfil' : 'ljudfiler'}
                  </p>
                  {audioMaterials.length > 0 && (
                    <button
                      type="button"
                      className={styles.playAllButton}
                      onClick={handlePlayAll}
                    >
                      <Play size={20} fill="currentColor" aria-hidden />
                      Spela alla
                    </button>
                  )}
                </div>
              </div>

              {/* tracks */}
              {audioMaterials.length === 0 ? (
                <div className={styles.emptyMain}>
                  <Music size={48} className={styles.emptyIcon} aria-hidden />
                  <h2 className={styles.emptyTitle}>
                    {selectedId === LIBRARY_SELECTED_ID || isLibraryMode
                      ? 'Inga favoriter ännu'
                      : 'Inga ljudfiler'}
                  </h2>
                  <p className={styles.emptyDescription}>
                    {selectedId === LIBRARY_SELECTED_ID || isLibraryMode
                      ? 'Du har inga favoriter ännu. Markera låtar med hjärtat för att samla dem här.'
                      : 'Det finns inga uppspelbara ljudfiler i den här låten ännu.'}
                  </p>
                </div>
              ) : (
                <div className={styles.trackScroll}>
                  <table className={styles.trackTable}>
                    <thead>
                      <tr>
                        <th className={styles.colIndex}>#</th>
                        <th>Titel</th>
                        <th className={styles.colAction} />
                      </tr>
                    </thead>
                    <tbody>
                      {audioMaterials.map((m, index) => {
                        const label = m.title || m.fileKey?.split('/').pop() || 'Okänd';
                        const isRowActive =
                          playerQueue.length > 0 &&
                          !!selectedId &&
                          highlightedTrackIndex === index;
                        return (
                          <tr
                            key={m.materialId}
                            className={`${styles.trackRow} ${isRowActive ? styles.rowActive : ''}`}
                            onClick={() => handlePlayTrackAt(index)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handlePlayTrackAt(index);
                              }
                            }}
                            tabIndex={0}
                            aria-label={`Spela ${label}`}
                          >
                            <td className={styles.colIndex}>
                              <span className={styles.trackNumber}>{index + 1}</span>
                              <Play
                                size={14}
                                fill="currentColor"
                                className={styles.trackPlayIcon}
                                aria-hidden
                              />
                            </td>
                            <td>
                              <span className={styles.trackTitleCell}>{label}</span>
                            </td>
                            <td className={styles.colAction}>
                              <span
                                style={{
                                  position: 'relative',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                }}
                              >
                                <button
                                  type="button"
                                  className={styles.playRowButton}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFavoriteOptimistic(m.materialId);
                                  }}
                                  aria-label={
                                    favoriteMaterialIds.includes(m.materialId)
                                      ? `Ta bort ${label} från favoriter`
                                      : `Lägg till ${label} i favoriter`
                                  }
                                  aria-pressed={favoriteMaterialIds.includes(m.materialId)}
                                >
                                  <Heart
                                    size={18}
                                    fill={
                                      favoriteMaterialIds.includes(m.materialId)
                                        ? 'currentColor'
                                        : 'none'
                                    }
                                  />
                                </button>
                                <button
                                  type="button"
                                  className={styles.playRowButton}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveDropdownId((prev) =>
                                      prev === m.materialId ? null : m.materialId
                                    );
                                  }}
                                  aria-expanded={activeDropdownId === m.materialId}
                                  aria-haspopup="menu"
                                  aria-label={`Lägg till ${label} i spellista`}
                                >
                                  <ListPlus size={18} aria-hidden />
                                </button>
                                {activeDropdownId === m.materialId && (
                                  <div
                                    role="menu"
                                    style={{
                                      position: 'absolute',
                                      right: 0,
                                      top: '100%',
                                      zIndex: 50,
                                      backgroundColor: '#222',
                                      border: '1px solid #444',
                                      borderRadius: '6px',
                                      padding: '8px',
                                      minWidth: '180px',
                                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {(playlistAddError || playlistsHookError) && (
                                      <p
                                        role="alert"
                                        style={{
                                          margin: '0 0 8px',
                                          color: '#f87171',
                                          fontSize: '0.8rem',
                                        }}
                                      >
                                        {playlistAddError ?? playlistsHookError}
                                      </p>
                                    )}
                                    {playlistsLoading ? (
                                      <p style={{ margin: 0, color: '#aaa', fontSize: '0.85rem' }}>
                                        Laddar…
                                      </p>
                                    ) : playlists.length === 0 ? (
                                      <p style={{ margin: 0, color: '#aaa', fontSize: '0.85rem' }}>
                                        Inga spellistor.
                                      </p>
                                    ) : (
                                      <ul
                                        style={{
                                          margin: 0,
                                          padding: 0,
                                          listStyle: 'none',
                                          display: 'flex',
                                          flexDirection: 'column',
                                          gap: 4,
                                        }}
                                      >
                                        {playlists.map((p) => (
                                          <li key={p.playlistId}>
                                            <button
                                              type="button"
                                              role="menuitem"
                                              disabled={playlistAddBusyId === p.playlistId}
                                              style={{
                                                width: '100%',
                                                textAlign: 'left',
                                                padding: '6px 8px',
                                                border: 'none',
                                                borderRadius: 4,
                                                background: 'transparent',
                                                color: '#eee',
                                                cursor:
                                                  playlistAddBusyId === p.playlistId
                                                    ? 'wait'
                                                    : 'pointer',
                                                fontSize: '0.875rem',
                                              }}
                                              onClick={async (e) => {
                                                e.stopPropagation();
                                                setPlaylistAddError(null);
                                                setPlaylistAddBusyId(p.playlistId);
                                                try {
                                                  await addPlaylistItem(p.playlistId, m.materialId);
                                                  setActiveDropdownId(null);
                                                } catch (err) {
                                                  console.error(err);
                                                  setPlaylistAddError(
                                                    err instanceof Error && err.message.trim()
                                                      ? err.message
                                                      : 'Något gick fel. Försök igen.'
                                                  );
                                                } finally {
                                                  setPlaylistAddBusyId(null);
                                                }
                                              }}
                                            >
                                              {p.title}
                                            </button>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                )}
                                <button
                                  type="button"
                                  className={styles.playRowButton}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePlayTrackAt(index);
                                  }}
                                  aria-label={`Spela ${label}`}
                                >
                                  <Play size={18} />
                                </button>
                                {isCurrentViewPlaylist && (
                                  <button
                                    type="button"
                                    className={styles.playRowButton}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleRemoveFromPlaylist(m.materialId);
                                    }}
                                    aria-label={`Ta bort ${label} från spellistan`}
                                  >
                                    <Trash2 size={18} aria-hidden />
                                  </button>
                                )}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── repertoire sidebar (right) ── */}
        {!isLibraryMode && (
          <aside className={styles.sidebar} aria-label="Repertoar">
            <h2 className={styles.sidebarTitle}>Repertoar</h2>
            {loadingList ? (
              <p className={styles.muted}>Laddar...</p>
            ) : repertoires.length === 0 ? (
              <p className={styles.muted}>Ingen repertoar för denna kör.</p>
            ) : (
              <ul className={styles.folderList}>
                {repertoires.map((item) => (
                  <li key={item.repertoireId}>
                    <button
                      type="button"
                      className={`${styles.folderButton} ${selectedId === item.repertoireId ? styles.folderButtonActive : ''}`}
                      onClick={() => handleSelectRepertoire(item.repertoireId)}
                    >
                      <Music size={16} className={styles.folderIcon} aria-hidden />
                      <span className={styles.folderLabel}>{item.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>

      {error && <p className={styles.errorBanner}>{error}</p>}

      {/* ── player dock ── */}
      <div className={styles.playerDock} role="region" aria-label="Uppspelning">
        {playerQueue.length > 0 ? (
          <MediaPlayer
            key={mediaPlayerMountKey}
            tracks={playerQueue}
            initialTrackIndex={playerStartIndex}
            autoAdvanceToNext
            variant="embedded"
            onTrackIndexChange={(i) => setHighlightedTrackIndex(i)}
            persistProgressKey={persistProgressKey}
            syncPlaybackToContext
          />
        ) : (
          <div className={styles.emptyPlayerDock}>
            <Music size={20} className={styles.emptyPlayerIcon} aria-hidden />
            <p>Välj ett spår för att börja lyssna</p>
          </div>
        )}
      </div>
    </div>
  );
}
