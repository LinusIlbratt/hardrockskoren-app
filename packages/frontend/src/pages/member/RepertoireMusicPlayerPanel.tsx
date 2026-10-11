import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import {
  Music,
  Play,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Disc3,
  Heart,
  ListPlus,
  ListMusic,
  FolderOpen,
  PlusSquare,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { MediaPlayer } from "@/components/media/MediaPlayer";
import {
  LIBRARY_SELECTED_ID,
  useRepertoirePlaylist,
} from "@/features/music-player/hooks/useRepertoirePlaylist";
import type { Material } from "@/types";
import {
  type LibraryPlaybackIntent,
  type MusicPlayerViewer,
  type RepertoirePlaybackIntent,
} from "@/context/MusicPlayerOverlayContext";
import { displayMaterialLabel, materialLabelText } from "@/utils/materialLabel";
import { formatDisplayTitle, isPlayableAudioFile } from "@/utils/media";
import { addPlaylistItem } from "@/services/musicService";
import { CreatePlaylistModal, RenamePlaylistModal } from '@/components/music/PlaylistTitleModals';
import { Loader, LoaderSize } from "@/components/ui/loader/Loader";
import { Cluster } from "@/components/ui/layout/Cluster";
import { Stack } from "@/components/ui/layout/Stack";
/** Watermark asset — replace with e.g. `import tracklistWatermarkLogo from '@/assets/logo.svg'` when added. */
import tracklistWatermarkLogo from "@/assets/images/hrk-logo.webp";
import styles from "./RepertoireMusicPlayerPage.module.scss";

/** Bredd för spelliste-kebab (portal) — används till positionering */
const PLAYLIST_MENU_WIDTH_PX = 180;

/** Samma gräns som $tabletBreakpoint i styles/_variables.scss. Mobil är strikt under den. */
const TABLET_MIN_PX = 768;
const BELOW_TABLET_QUERY = `(max-width: ${TABLET_MIN_PX - 1}px)`;

export interface RepertoireMusicPlayerPanelProps {
  groupName: string;
  viewer: MusicPlayerViewer;
  /** Stänger fullskärm (miniplayer fortsätter). */
  onMinimizeOverlay: () => void;
  shellTitleId?: string;
  /** Spelläge: favoriter / bibliotek utan repertoar-sidebar */
  libraryQueueMaterials?: Material[] | null;
  libraryPlaybackIntent?: LibraryPlaybackIntent | null;
  /** Sjung upp: kö från bibliotek men repertoar ska laddas och visas. */
  libraryPlaybackWithRepertoire?: boolean;
  /** Direkt öppning av repertoar (normalt läge — sidebar "Repertoar" synlig). */
  initialRepertoireId?: string | null;
  initialPlaylistId?: string | null;
  repertoirePlaybackIntent?: RepertoirePlaybackIntent | null;
}

export function RepertoireMusicPlayerPanel({
  groupName,
  viewer,
  onMinimizeOverlay,
  shellTitleId,
  libraryQueueMaterials = null,
  libraryPlaybackIntent = null,
  libraryPlaybackWithRepertoire = false,
  initialRepertoireId = null,
  initialPlaylistId = null,
  repertoirePlaybackIntent = null,
}: RepertoireMusicPlayerPanelProps) {
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [playlistAddBusyId, setPlaylistAddBusyId] = useState<string | null>(
    null,
  );
  const [playlistAddError, setPlaylistAddError] = useState<string | null>(null);
  const [playlistMenuOpenId, setPlaylistMenuOpenId] = useState<string | null>(
    null,
  );
  const [playlistMenuCoords, setPlaylistMenuCoords] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const playlistMenuButtonRefs = useRef<
    Record<string, HTMLButtonElement | null>
  >({});
  const [playlistRenameTarget, setPlaylistRenameTarget] = useState<{
    playlistId: string;
    title: string;
  } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmPlaylistId, setDeleteConfirmPlaylistId] = useState<
    string | null
  >(null);
  const [deletePlaylistBusy, setDeletePlaylistBusy] = useState(false);
  /** Mobil under $tabletBreakpoint (768px): spellistor/repertoar i mitten utan modal */
  const [mobileBrowseMode, setMobileBrowseMode] = useState<
    null | "playlists" | "repertoires"
  >(null);
  const [isMobileShell, setIsMobileShell] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(BELOW_TABLET_QUERY).matches,
  );

  const {
    sortedRepertoires,
    repertoires,
    playlists,
    playlistsLoading,
    playlistsHookError,
    fetchPlaylists,
    selectedId,
    materials,
    playerQueue,
    playerStartIndex,
    highlightedTrackIndex,
    setHighlightedTrackIndex,
    loadingList,
    loadingTracks,
    error,
    audioMaterials,
    mediaPlayerMountKey,
    persistProgressKey,
    hasLibraryPlaybackQueue,
    isStandaloneLibrarySession,
    favoriteMaterialIds,
    favoriteMaterials,
    toggleFavoriteOptimistic,
    newPlaylistTitle,
    setNewPlaylistTitle,
    creatingPlaylist,
    mobileCreatePlaylistOpen,
    setMobileCreatePlaylistOpen,
    handleSelectRepertoire,
    handleSelectPlaylist,
    handlePlayTrackAt,
    handlePlayFavorites,
    handleCreatePlaylistInSidebar,
    handleCreatePlaylistMobile,
    deletePlaylist,
    renamePlaylist,
    clearSelection,
    handleRemoveFromPlaylist,
  } = useRepertoirePlaylist({
    groupName,
    viewer,
    libraryQueueMaterials,
    libraryPlaybackIntent,
    libraryPlaybackWithRepertoire,
    initialRepertoireId,
    initialPlaylistId,
    repertoirePlaybackIntent,
    onPlaybackStart: () => setActiveDropdownId(null),
  });

  useEffect(() => {
    const mq = window.matchMedia(BELOW_TABLET_QUERY);
    const onChange = () => setIsMobileShell(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!isMobileShell) {
      setMobileBrowseMode(null);
    }
  }, [isMobileShell]);

  const isPlaylistSelected = playlists.some((p) => p.playlistId === selectedId);
  const isRepertoireSelected = repertoires.some(
    (r) => r.repertoireId === selectedId,
  );

  useEffect(() => {
    if (!isMobileShell) return;
    if (isPlaylistSelected) {
      setMobileBrowseMode("playlists");
    } else if (!isStandaloneLibrarySession && isRepertoireSelected) {
      setMobileBrowseMode("repertoires");
    }
  }, [isMobileShell, isStandaloneLibrarySession, isPlaylistSelected, isRepertoireSelected]);

  const closePlaylistMenu = useCallback(() => {
    setPlaylistMenuOpenId(null);
    setPlaylistMenuCoords(null);
  }, []);

  const updatePlaylistMenuPosition = useCallback((playlistId: string) => {
    const btn = playlistMenuButtonRefs.current[playlistId];
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    let left = r.right - PLAYLIST_MENU_WIDTH_PX;
    left = Math.max(
      8,
      Math.min(left, window.innerWidth - PLAYLIST_MENU_WIDTH_PX - 8),
    );
    setPlaylistMenuCoords({ top: r.bottom + 4, left });
  }, []);

  const openMobilePlaylistBrowse = useCallback(() => {
    setMobileBrowseMode("playlists");
    clearSelection();
    closePlaylistMenu();
  }, [clearSelection, closePlaylistMenu]);

  const openMobileRepertoireBrowse = useCallback(() => {
    setMobileBrowseMode("repertoires");
    clearSelection();
    closePlaylistMenu();
  }, [clearSelection, closePlaylistMenu]);

  const handleMobileBackFromTracks = useCallback(() => {
    clearSelection();
    closePlaylistMenu();
  }, [clearSelection, closePlaylistMenu]);

  useEffect(() => {
    if (!playlistRenameTarget) {
      setRenameDraft("");
      return;
    }
    setRenameDraft(playlistRenameTarget.title);
  }, [playlistRenameTarget]);

  useLayoutEffect(() => {
    if (!playlistMenuOpenId) return;
    const onScrollOrResize = () =>
      updatePlaylistMenuPosition(playlistMenuOpenId);
    onScrollOrResize();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [playlistMenuOpenId, updatePlaylistMenuPosition]);

  useEffect(() => {
    if (playlistMenuOpenId === null) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest(`[data-playlist-row-menu="${playlistMenuOpenId}"]`))
        return;
      if (el.closest("[data-playlist-dropdown-portal]")) return;
      closePlaylistMenu();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [playlistMenuOpenId, closePlaylistMenu]);

  useEffect(() => {
    if (activeDropdownId === null) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest(`[data-add-playlist-popover="${activeDropdownId}"]`))
        return;
      setActiveDropdownId(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [activeDropdownId]);

  const handleConfirmRenamePlaylist = async () => {
    if (!playlistRenameTarget) return;
    const t = renameDraft.trim();
    if (!t) return;
    setRenameBusy(true);
    try {
      await renamePlaylist(playlistRenameTarget.playlistId, t);
      setPlaylistRenameTarget(null);
    } catch {
      /* hook sets error */
    } finally {
      setRenameBusy(false);
    }
  };

  const closeDeletePlaylistConfirm = useCallback(() => {
    if (deletePlaylistBusy) return;
    setShowDeleteConfirm(false);
    setDeleteConfirmPlaylistId(null);
  }, [deletePlaylistBusy]);

  const openDeletePlaylistConfirm = useCallback(
    (playlistId: string) => {
      setDeleteConfirmPlaylistId(playlistId);
      setShowDeleteConfirm(true);
      closePlaylistMenu();
    },
    [closePlaylistMenu],
  );

  const handleConfirmDeletePlaylist = useCallback(async () => {
    const playlistId = deleteConfirmPlaylistId?.trim();
    if (!playlistId) return;
    setDeletePlaylistBusy(true);
    try {
      await deletePlaylist(playlistId);
      setShowDeleteConfirm(false);
      setDeleteConfirmPlaylistId(null);
      if (selectedId === playlistId) {
        clearSelection();
      }
    } catch {
      /* hook sets error */
    } finally {
      setDeletePlaylistBusy(false);
    }
  }, [deleteConfirmPlaylistId, deletePlaylist, selectedId, clearSelection]);

  useEffect(() => {
    if (!showDeleteConfirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDeletePlaylistConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showDeleteConfirm, closeDeletePlaylistConfirm]);

  useEffect(() => {
    if (!activeDropdownId) return;
    setPlaylistAddError(null);
    void fetchPlaylists();
  }, [activeDropdownId, fetchPlaylists]);

  const selectedPlaylistTitle = playlists.find(
    (p) => p.playlistId === selectedId,
  )?.title;
  const selectedRepertoireTitle = repertoires.find(
    (r) => r.repertoireId === selectedId,
  )?.title;
  const isFavoritesView =
    (selectedId === LIBRARY_SELECTED_ID && !libraryPlaybackWithRepertoire) ||
    isStandaloneLibrarySession;
  const isPracticeQueueView =
    libraryPlaybackWithRepertoire &&
    selectedId === LIBRARY_SELECTED_ID &&
    hasLibraryPlaybackQueue;
  const selectedTitle = isFavoritesView
    ? "Mina favoriter"
    : isPracticeQueueView
      ? formatDisplayTitle(
          materials[0]?.title ||
            materials[0]?.fileKey?.split("/").pop() ||
            "Sjung upp",
        ) || "Sjung upp"
      : (selectedPlaylistTitle ?? selectedRepertoireTitle);
  const heroArtworkInitial = (selectedTitle || "?").charAt(0).toUpperCase();

  const showMobilePlaylistPicker =
    isMobileShell && mobileBrowseMode === "playlists" && !isPlaylistSelected;
  const showMobileRepertoirePicker =
    isMobileShell &&
    !isStandaloneLibrarySession &&
    mobileBrowseMode === "repertoires" &&
    !isRepertoireSelected;
  const showMobileBackBar =
    isMobileShell &&
    ((mobileBrowseMode === "playlists" && isPlaylistSelected) ||
      (mobileBrowseMode === "repertoires" && isRepertoireSelected));

  /** Bakgrundsvattenstämpel i mittenpanelen (inte välkomstvy / mobilväljare). */
  const showShellMainWatermark =
    !showMobilePlaylistPicker &&
    !showMobileRepertoirePicker &&
    (Boolean(selectedId) || isStandaloneLibrarySession);

  const shellBodyClass = [
    styles.shellBody,
    isStandaloneLibrarySession ? styles.shellBodyLibrary : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.musicShell}>
      <span id={shellTitleId} className={styles.shellTitleSr}>
        Musik
      </span>
      {/* ── top bar (desktop). På mobil ersätts den av flikraden. ── */}
      <header className={styles.shellTop}>
        <Cluster className={styles.shellTopLeft} align="center" gap="sm" wrap={false}>
          <span className={styles.shellBrand} aria-hidden>
            HRK
          </span>
          <span className={styles.shellBrandTitle}>
            Musik
          </span>
        </Cluster>
        <Cluster className={styles.shellTopRight} justify="end" align="center" gap="sm" wrap>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onMinimizeOverlay}
            aria-label="Minimera musikspelare"
          >
            <ChevronDown size={22} aria-hidden />
          </button>
        </Cluster>
      </header>

      {/* ── body ── */}
      <div className={shellBodyClass}>
        {/* Mobil: ikonrad — spellistor/repertoar öppnar listor i huvudytan */}
        <Cluster
          className={styles.shellMobileIconRail}
          role="toolbar"
          aria-label="Bibliotek och repertoar"
          justify="start"
          align="center"
          gap="2xs"
          wrap={false}
        >
          <div className={styles.shellMobileIconTabs}>
          <button
            type="button"
            className={`${styles.shellMobileIconBtn} ${
              selectedId === LIBRARY_SELECTED_ID || isStandaloneLibrarySession
                ? `${styles.shellMobileIconBtnActive} ${styles.shellMobileIconFavoritesActive}`
                : ""
            }`}
            onClick={() => {
              setMobileCreatePlaylistOpen(false);
              setMobileBrowseMode(null);
              handlePlayFavorites();
            }}
            aria-label={`Favoriter (${favoriteMaterials.filter((m) => m.fileKey && isPlayableAudioFile(m.fileKey)).length} spår)`}
          >
            <span className={styles.shellMobileIconBtnInner}>
              <span className={styles.shellMobileIconGlyph}>
                <Heart
                  size={24}
                  strokeWidth={1.75}
                  fill={
                    selectedId === LIBRARY_SELECTED_ID || isStandaloneLibrarySession
                      ? "currentColor"
                      : "none"
                  }
                  aria-hidden
                />
              </span>
              <span className={styles.shellMobileIconLabel}>Favoriter</span>
            </span>
          </button>
          <button
            type="button"
            className={`${styles.shellMobileIconBtn} ${
              isPlaylistSelected || showMobilePlaylistPicker
                ? styles.shellMobileIconBtnActive
                : ""
            }`}
            onClick={() => {
              setMobileCreatePlaylistOpen(false);
              openMobilePlaylistBrowse();
            }}
            aria-label="Spellistor"
            aria-expanded={showMobilePlaylistPicker}
          >
            <span className={styles.shellMobileIconBtnInner}>
              <span className={styles.shellMobileIconGlyph}>
                <ListMusic size={24} strokeWidth={1.75} aria-hidden />
              </span>
              <span className={styles.shellMobileIconLabel}>Spellistor</span>
            </span>
          </button>
          {!isStandaloneLibrarySession && (
            <button
              type="button"
              className={`${styles.shellMobileIconBtn} ${
                isRepertoireSelected || showMobileRepertoirePicker
                  ? styles.shellMobileIconBtnActive
                  : ""
              }`}
              onClick={() => {
                setMobileCreatePlaylistOpen(false);
                openMobileRepertoireBrowse();
              }}
              aria-label="Repertoar"
              aria-expanded={showMobileRepertoirePicker}
            >
              <span className={styles.shellMobileIconBtnInner}>
                <span className={styles.shellMobileIconGlyph}>
                  <FolderOpen size={24} strokeWidth={1.75} aria-hidden />
                </span>
                <span className={styles.shellMobileIconLabel}>Repertoar</span>
              </span>
            </button>
          )}
          <button
            type="button"
            className={`${styles.shellMobileIconBtn} ${mobileCreatePlaylistOpen ? styles.shellMobileIconBtnActive : ""}`}
            onClick={() => {
              setMobileBrowseMode(null);
              setMobileCreatePlaylistOpen(true);
            }}
            aria-label="Ny spellista"
          >
            <span className={styles.shellMobileIconBtnInner}>
              <span className={styles.shellMobileIconGlyph}>
                <PlusSquare size={24} strokeWidth={1.75} aria-hidden />
              </span>
              <span className={styles.shellMobileIconLabel}>Skapa</span>
            </span>
          </button>
          </div>
          <button
            type="button"
            className={styles.shellMobileMinimize}
            onClick={onMinimizeOverlay}
            aria-label="Minimera musikspelare"
          >
            <ChevronDown size={22} aria-hidden />
          </button>
        </Cluster>

        {/* ── playlist sidebar (left) ── */}
        <aside className={styles.playlistSidebar} aria-label="Dina spellistor">
          <h2 className={styles.playlistSidebarTitle}>Mitt bibliotek</h2>

          <Stack className={styles.playlistSidebarSection} gap="xs">
            <p className={styles.playlistSidebarSectionLabel}>Favoriter</p>
            <ul className={styles.playlistSidebarList}>
              <li>
                <button
                  type="button"
                  className={`${styles.playlistSidebarItem} ${isStandaloneLibrarySession ? styles.playlistSidebarItemActive : ""}`}
                  onClick={handlePlayFavorites}
                >
                  <Heart
                    size={14}
                    className={styles.playlistSidebarItemIcon}
                    aria-hidden
                  />
                  <span className={styles.playlistSidebarItemLabel}>
                    Favoriter (
                    {
                      favoriteMaterials.filter(
                        (m) => m.fileKey && isPlayableAudioFile(m.fileKey),
                      ).length
                    }
                    )
                  </span>
                </button>
              </li>
            </ul>
          </Stack>

          <Stack className={styles.playlistSidebarPlaylistsStack} gap="xs">
            <p className={styles.playlistSidebarSectionLabel}>Spellistor</p>

            <div className={styles.playlistSidebarCreate}>
              <Cluster className={styles.playlistSidebarCreateRow} align="center" gap="sm" wrap={false}>
                <input
                  type="text"
                  className={styles.playlistSidebarInput}
                  placeholder="Ny spellista…"
                  value={newPlaylistTitle}
                  onChange={(e) => setNewPlaylistTitle(e.target.value)}
                  disabled={creatingPlaylist}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleCreatePlaylistInSidebar();
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
              </Cluster>
            </div>

            <div
              className={styles.playlistSidebarPlaylistScroll}
              role="region"
              aria-label="Lista över spellistor"
            >
              <ul className={styles.playlistSidebarList}>
                {playlistsLoading ? (
                  <li>
                    <p className={styles.muted}>Laddar…</p>
                  </li>
                ) : playlists.length === 0 ? (
                  <li>
                    <p className={styles.muted}>Inga spellistor ännu.</p>
                  </li>
                ) : (
                  playlists.map((p) => (
                    <li
                      key={p.playlistId}
                      className={`${styles.playlistSidebarRow} ${selectedId === p.playlistId ? styles.playlistSidebarRowActive : ""}`}
                    >
                      <button
                        type="button"
                        className={`${styles.playlistSidebarItem} ${selectedId === p.playlistId ? styles.playlistSidebarItemActive : ""}`}
                        onClick={() => {
                          closePlaylistMenu();
                          void handleSelectPlaylist(p.playlistId);
                        }}
                      >
                        <ListPlus
                          size={14}
                          className={styles.playlistSidebarItemIcon}
                          aria-hidden
                        />
                        <span className={styles.playlistSidebarItemLabel}>
                          {p.title}
                        </span>
                      </button>
                      <div
                        className={`${styles.playlistSidebarRowMenu} ${playlistMenuOpenId === p.playlistId ? styles.playlistSidebarRowMenuOpen : ""}`}
                        data-playlist-row-menu={p.playlistId}
                      >
                        <button
                          type="button"
                          ref={(el) => {
                            playlistMenuButtonRefs.current[p.playlistId] = el;
                          }}
                          className={styles.playlistSidebarMenuTrigger}
                          aria-expanded={playlistMenuOpenId === p.playlistId}
                          aria-haspopup="menu"
                          aria-label={`Fler alternativ för ${p.title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (playlistMenuOpenId === p.playlistId) {
                              closePlaylistMenu();
                              return;
                            }
                            const btn =
                              playlistMenuButtonRefs.current[p.playlistId];
                            if (btn) {
                              const r = btn.getBoundingClientRect();
                              let left = r.right - PLAYLIST_MENU_WIDTH_PX;
                              left = Math.max(
                                8,
                                Math.min(
                                  left,
                                  window.innerWidth -
                                    PLAYLIST_MENU_WIDTH_PX -
                                    8,
                                ),
                              );
                              setPlaylistMenuCoords({
                                top: r.bottom + 4,
                                left,
                              });
                            } else {
                              setPlaylistMenuCoords(null);
                            }
                            setPlaylistMenuOpenId(p.playlistId);
                          }}
                        >
                          <MoreHorizontal
                            size={16}
                            strokeWidth={2}
                            className={styles.playlistSidebarMenuIcon}
                            aria-hidden
                          />
                        </button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </Stack>
        </aside>

        {playlistMenuOpenId &&
          playlistMenuCoords &&
          (() => {
            const menuPl = playlists.find(
              (x) => x.playlistId === playlistMenuOpenId,
            );
            if (!menuPl) return null;
            return createPortal(
              <div
                data-playlist-dropdown-portal
                role="menu"
                className={styles.playlistSidebarDropdownPortal}
                style={{
                  position: "fixed",
                  top: playlistMenuCoords.top,
                  left: playlistMenuCoords.left,
                  zIndex: 10000,
                  minWidth: PLAYLIST_MENU_WIDTH_PX,
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className={styles.playlistSidebarDropdownPortalItem}
                  onClick={() => {
                    setPlaylistRenameTarget({
                      playlistId: menuPl.playlistId,
                      title: menuPl.title,
                    });
                    closePlaylistMenu();
                  }}
                >
                  Byt namn
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`${styles.playlistSidebarDropdownPortalItem} ${styles.playlistSidebarDropdownPortalItemDanger}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    openDeletePlaylistConfirm(menuPl.playlistId);
                  }}
                >
                  Ta bort spellista
                </button>
              </div>,
              document.body,
            );
          })()}

        {showDeleteConfirm &&
          deleteConfirmPlaylistId &&
          createPortal(
            <div
              className={styles.deleteConfirmOverlay}
              role="presentation"
              onClick={closeDeletePlaylistConfirm}
            >
              <div
                className={styles.deleteConfirmCard}
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-playlist-confirm-title"
                onClick={(e) => e.stopPropagation()}
              >
                <h2
                  id="delete-playlist-confirm-title"
                  className={styles.deleteConfirmTitle}
                >
                  Ta bort spellistan?
                </h2>
                <p className={styles.deleteConfirmBody}>
                  Är du säker på att du vill ta bort spellistan? Detta går inte
                  att ångra.
                </p>
                <Cluster className={styles.deleteConfirmActions} justify="end" align="center" gap="sm" wrap>
                  <button
                    type="button"
                    className={styles.deleteConfirmButtonCancel}
                    disabled={deletePlaylistBusy}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeDeletePlaylistConfirm();
                    }}
                  >
                    Avbryt
                  </button>
                  <button
                    type="button"
                    className={styles.deleteConfirmButtonDelete}
                    disabled={deletePlaylistBusy}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleConfirmDeletePlaylist();
                    }}
                  >
                    {deletePlaylistBusy ? "Tar bort…" : "Ta bort"}
                  </button>
                </Cluster>
              </div>
            </div>,
            document.body,
          )}

        {/* ── main ── */}
        <section className={styles.shellMain} aria-label="Spår och uppspelning">
          {showShellMainWatermark ? (
            <div className={styles.shellMainWatermark} aria-hidden>
              <img
                src={tracklistWatermarkLogo}
                alt=""
                className={styles.shellMainWatermarkImg}
                draggable={false}
              />
            </div>
          ) : null}
          {showMobilePlaylistPicker ? (
            <div className={styles.mobileMainPicker}>
              <header className={styles.mobileMainPickerHead}>
                <p className={styles.mobileMainPickerEyebrow}>Mitt bibliotek</p>
                <h2 className={styles.mobileMainPickerTitle}>Spellistor</h2>
                <p className={styles.mobileMainPickerSub}>
                  {playlistsLoading
                    ? "Hämtar dina spellistor…"
                    : `${playlists.length} ${playlists.length === 1 ? "spellista" : "spellistor"}`}
                </p>
              </header>
              {playlistsHookError ? (
                <p className={styles.mobilePickerEmpty} role="alert">
                  {playlistsHookError}
                </p>
              ) : playlistsLoading ? (
                <p className={styles.mobilePickerEmpty}>Laddar…</p>
              ) : playlists.length === 0 ? (
                <p className={styles.mobilePickerEmpty}>
                  Inga spellistor ännu. Tryck på Skapa för att lägga till en.
                </p>
              ) : (
                <ul
                  className={`${styles.mobilePickerList} ${styles.mobilePickerListInMain}`}
                >
                  {playlists.map((p) => (
                    <li
                      key={p.playlistId}
                      className={styles.mobilePickerListItem}
                    >
                      <button
                        type="button"
                        className={styles.mobilePickerRow}
                        onClick={() => {
                          closePlaylistMenu();
                          void handleSelectPlaylist(p.playlistId);
                        }}
                      >
                        <span
                          className={`${styles.mobilePickerRowArt} ${styles.mobilePickerRowArtPlaylist}`}
                          aria-hidden
                        >
                          <ListMusic size={22} strokeWidth={1.75} />
                        </span>
                        <span className={styles.mobilePickerRowText}>
                          <span className={styles.mobilePickerRowTitle}>
                            {p.title}
                          </span>
                          <span className={styles.mobilePickerRowMeta}>
                            Spellista
                          </span>
                        </span>
                        <ChevronRight
                          size={20}
                          strokeWidth={2}
                          className={styles.mobilePickerRowChevron}
                          aria-hidden
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : showMobileRepertoirePicker ? (
            <div
              className={`${styles.mobileMainPicker} ${styles.mobileMainPickerRepertoire}`}
            >
              <header className={styles.mobileMainPickerHead}>
                <p className={styles.mobileMainPickerEyebrow}>Kören</p>
                <h2 className={styles.mobileMainPickerTitle}>Repertoar</h2>
                <p className={styles.mobileMainPickerSub}>
                  {loadingList
                    ? "Hämtar repertoar…"
                    : `${repertoires.length} ${repertoires.length === 1 ? "mapp" : "mappar"}`}
                </p>
              </header>
              {loadingList ? (
                <p className={styles.mobilePickerEmpty}>Laddar…</p>
              ) : repertoires.length === 0 ? (
                <p className={styles.mobilePickerEmpty}>
                  Ingen repertoar för denna kör.
                </p>
              ) : (
                <ul
                  className={`${styles.mobilePickerList} ${styles.mobilePickerListInMain}`}
                >
                  {sortedRepertoires.map((item) => (
                    <li
                      key={item.repertoireId}
                      className={styles.mobilePickerListItem}
                    >
                      <button
                        type="button"
                        className={styles.mobilePickerRow}
                        onClick={() =>
                          handleSelectRepertoire(item.repertoireId)
                        }
                      >
                        <span
                          className={`${styles.mobilePickerRowArt} ${styles.mobilePickerRowArtRepertoire}`}
                          aria-hidden
                        >
                          <Music size={22} strokeWidth={1.75} />
                        </span>
                        <span className={styles.mobilePickerRowText}>
                          <span className={styles.mobilePickerRowTitle}>
                            {item.title}
                          </span>
                          <span className={styles.mobilePickerRowMeta}>
                            Repertoarmapp
                          </span>
                        </span>
                        <ChevronRight
                          size={20}
                          strokeWidth={2}
                          className={styles.mobilePickerRowChevron}
                          aria-hidden
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : !selectedId && !isStandaloneLibrarySession ? (
            /* ── welcome state ── */
            <div className={styles.emptyMain}>
              <Disc3 size={64} className={styles.emptyIcon} aria-hidden />
              <h2 className={styles.emptyTitle}>
                Välkommen till musikspelaren
              </h2>
              <p className={styles.emptyDescription}>
                {isMobileShell
                  ? "Välj spellista eller repertoar med ikonerna ovan."
                  : "Välj en låt i biblioteket till höger för att lyssna eller spara i en egen låtlista."}
              </p>
            </div>
          ) : !selectedId && isStandaloneLibrarySession ? (
            <div className={styles.trackMainSurface}>
              <div
                className={styles.trackSurfaceLoading}
                role="status"
                aria-live="polite"
              >
                <Loader size={LoaderSize.MEDIUM} />
                <p className={styles.trackSurfaceLoadingText}>
                  Laddar bibliotek…
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.hero}>
                {showMobileBackBar && (
                  <button
                    type="button"
                    className={styles.heroBackButton}
                    onClick={handleMobileBackFromTracks}
                    aria-label={
                      mobileBrowseMode === "playlists"
                        ? "Tillbaka till spellistor"
                        : "Tillbaka till repertoar"
                    }
                  >
                    <ChevronLeft size={22} strokeWidth={2} aria-hidden />
                  </button>
                )}
                <div
                  className={`${styles.heroArt} ${isFavoritesView ? styles.heroArtFavorites : ''}`}
                  aria-hidden
                >
                  {isFavoritesView ? (
                    <Heart size={34} className={styles.heroArtIcon} />
                  ) : selectedPlaylistTitle ? (
                    <ListMusic size={34} className={styles.heroArtIcon} />
                  ) : (
                    <span className={styles.heroArtInitial}>{heroArtworkInitial}</span>
                  )}
                </div>
                <div className={styles.heroText}>
                  <p className={styles.heroEyebrow}>
                    {isFavoritesView
                      ? "Mitt bibliotek"
                      : selectedPlaylistTitle
                        ? "Spellista"
                        : "Repertoar"}
                  </p>
                  <h1 className={styles.heroTitle}>{selectedTitle}</h1>
                  <p className={styles.heroMeta}>
                    {loadingTracks
                      ? "Hämtar spår…"
                      : `${audioMaterials.length} ${audioMaterials.length === 1 ? "ljudfil" : "ljudfiler"}`}
                  </p>
                </div>
              </div>

              {loadingTracks ? (
                <div className={styles.trackMainSurface}>
                  <div
                    className={styles.trackSurfaceLoading}
                    role="status"
                    aria-live="polite"
                  >
                    <Loader size={LoaderSize.MEDIUM} />
                    <p className={styles.trackSurfaceLoadingText}>
                      Laddar spår…
                    </p>
                  </div>
                </div>
              ) : audioMaterials.length === 0 ? (
                <div className={styles.trackMainSurface}>
                  <div className={styles.emptyMain}>
                    <Music size={48} className={styles.emptyIcon} aria-hidden />
                    <h2 className={styles.emptyTitle}>
                      {selectedId === LIBRARY_SELECTED_ID || isStandaloneLibrarySession
                        ? "Inga favoriter ännu"
                        : "Inga ljudfiler"}
                    </h2>
                    <p className={styles.emptyDescription}>
                      {selectedId === LIBRARY_SELECTED_ID || isStandaloneLibrarySession
                        ? "Du har inga favoriter ännu. Markera låtar med hjärtat för att samla dem här."
                        : "Det finns inga uppspelbara ljudfiler i den här låtlistan ännu."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className={styles.trackListShell}>
                  <div className={styles.trackScroll}>
                    <table className={styles.trackTable}>
                    <thead className={styles.trackTableHead}>
                      <tr>
                        <th className={styles.colIndex} scope="col">
                          #
                        </th>
                        <th className={styles.colTitleHead} scope="col">
                          Titel
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {audioMaterials.map((m, index) => {
                        const fallback =
                          formatDisplayTitle(
                            m.title || m.fileKey?.split("/").pop() || "",
                          ) || "Okänd";
                        const label =
                          (m.voiceLabel?.trim() || m.songTitle?.trim()
                            ? materialLabelText(
                                displayMaterialLabel(
                                  m,
                                  selectedRepertoireTitle?.split(/\s+-\s+/)[0],
                                ),
                              )
                            : "") || fallback;
                        const isRowActive =
                          playerQueue.length > 0 &&
                          !!selectedId &&
                          highlightedTrackIndex === index;
                        return (
                          <tr
                            key={m.materialId}
                            className={`${styles.trackRow} ${isRowActive ? styles.rowActive : ""}`}
                            onClick={() => handlePlayTrackAt(index)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handlePlayTrackAt(index);
                              }
                            }}
                            tabIndex={0}
                            aria-label={`Spela ${label}`}
                          >
                            <td className={styles.colIndex}>
                              <span className={styles.trackNumber}>
                                {index + 1}
                              </span>
                              <Play
                                size={14}
                                fill="currentColor"
                                className={styles.trackPlayIcon}
                                aria-hidden
                              />
                            </td>
                            <td className={styles.colTitleBlock}>
                              <div className={styles.trackRowFlex}>
                                <span
                                  className={styles.trackRowMiniArt}
                                  aria-hidden
                                >
                                  {(label || "?").charAt(0).toUpperCase()}
                                </span>
                                <div className={styles.trackRowTextBlock}>
                                  <span className={styles.trackTitleCell}>
                                    {label}
                                  </span>
                                </div>
                                <div className={styles.trackRowActions}>
                                  <button
                                    type="button"
                                    className={styles.playRowButton}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveDropdownId(null);
                                      toggleFavoriteOptimistic(m.materialId, m);
                                    }}
                                    aria-label={
                                      favoriteMaterialIds.includes(m.materialId)
                                        ? `Ta bort ${label} från favoriter`
                                        : `Lägg till ${label} i favoriter`
                                    }
                                    aria-pressed={favoriteMaterialIds.includes(
                                      m.materialId,
                                    )}
                                  >
                                    <Heart
                                      size={18}
                                      fill={
                                        favoriteMaterialIds.includes(
                                          m.materialId,
                                        )
                                          ? "currentColor"
                                          : "none"
                                      }
                                    />
                                  </button>
                                  <span
                                    data-add-playlist-popover={m.materialId}
                                    className={styles.trackRowPopoverAnchor}
                                  >
                                    <button
                                      type="button"
                                      className={styles.playRowButton}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveDropdownId((prev) =>
                                          prev === m.materialId
                                            ? null
                                            : m.materialId,
                                        );
                                      }}
                                      aria-expanded={
                                        activeDropdownId === m.materialId
                                      }
                                      aria-haspopup="menu"
                                      aria-label={`Lägg till ${label} i spellista`}
                                    >
                                      <ListPlus size={18} aria-hidden />
                                    </button>
                                    {activeDropdownId === m.materialId && (
                                      <div
                                        role="menu"
                                        className={styles.trackRowPlaylistMenu}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {(playlistAddError ||
                                          playlistsHookError) && (
                                          <p
                                            className={
                                              styles.trackRowPlaylistMenuError
                                            }
                                            role="alert"
                                          >
                                            {playlistAddError ??
                                              playlistsHookError}
                                          </p>
                                        )}
                                        {playlistsLoading ? (
                                          <p
                                            className={
                                              styles.trackRowPlaylistMenuMuted
                                            }
                                          >
                                            Laddar…
                                          </p>
                                        ) : playlists.length === 0 ? (
                                          <p
                                            className={
                                              styles.trackRowPlaylistMenuMuted
                                            }
                                          >
                                            Inga spellistor.
                                          </p>
                                        ) : (
                                          <ul
                                            className={
                                              styles.trackRowPlaylistMenuList
                                            }
                                          >
                                            {playlists.map((p) => (
                                              <li key={p.playlistId}>
                                                <button
                                                  type="button"
                                                  role="menuitem"
                                                  disabled={
                                                    playlistAddBusyId ===
                                                    p.playlistId
                                                  }
                                                  className={
                                                    styles.trackRowPlaylistMenuItem
                                                  }
                                                  onClick={async (e) => {
                                                    e.stopPropagation();
                                                    setPlaylistAddError(null);
                                                    setPlaylistAddBusyId(
                                                      p.playlistId,
                                                    );
                                                    try {
                                                      await addPlaylistItem(
                                                        p.playlistId,
                                                        m.materialId,
                                                      );
                                                      setActiveDropdownId(null);
                                                    } catch (err) {
                                                      console.error(err);
                                                      setPlaylistAddError(
                                                        err instanceof Error &&
                                                          err.message.trim()
                                                          ? err.message
                                                          : "Något gick fel. Försök igen.",
                                                      );
                                                    } finally {
                                                      setPlaylistAddBusyId(
                                                        null,
                                                      );
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
                                  </span>
                                  <button
                                    type="button"
                                    className={`${styles.playRowButton} ${styles.trackRowPlayExplicit}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePlayTrackAt(index);
                                    }}
                                    aria-label={`Spela ${label}`}
                                  >
                                    <Play size={18} aria-hidden />
                                  </button>
                                  {isPlaylistSelected && (
                                    <button
                                      type="button"
                                      className={styles.playRowButton}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleRemoveFromPlaylist(
                                          m.materialId,
                                        );
                                      }}
                                      aria-label={`Ta bort ${label} från spellistan`}
                                    >
                                      <Trash2 size={18} aria-hidden />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── repertoire sidebar (right) ── */}
        {!isStandaloneLibrarySession && (
          <aside className={styles.sidebar} aria-label="Repertoar">
            <h2 className={styles.sidebarTitle}>Repertoar</h2>
            {loadingList ? (
              <p className={styles.muted}>Laddar...</p>
            ) : repertoires.length === 0 ? (
              <p className={styles.muted}>Ingen repertoar för denna kör.</p>
            ) : (
              <ul className={styles.folderList}>
                {sortedRepertoires.map((item) => (
                  <li key={item.repertoireId}>
                    <button
                      type="button"
                      className={`${styles.folderButton} ${selectedId === item.repertoireId ? styles.folderButtonActive : ""}`}
                      onClick={() => handleSelectRepertoire(item.repertoireId)}
                    >
                      <Music
                        size={16}
                        className={styles.folderIcon}
                        aria-hidden
                      />
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

      <CreatePlaylistModal
        isOpen={mobileCreatePlaylistOpen}
        isBusy={creatingPlaylist}
        value={newPlaylistTitle}
        onChange={setNewPlaylistTitle}
        onClose={() => {
          setMobileCreatePlaylistOpen(false);
          setNewPlaylistTitle("");
        }}
        onSubmit={() => void handleCreatePlaylistMobile()}
      />

      <RenamePlaylistModal
        isOpen={Boolean(playlistRenameTarget)}
        isBusy={renameBusy}
        value={renameDraft}
        initialTitle={playlistRenameTarget?.title ?? ""}
        onChange={setRenameDraft}
        onClose={() => setPlaylistRenameTarget(null)}
        onSubmit={() => void handleConfirmRenamePlaylist()}
      />
    </div>
  );
}
