import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Music, Play, ChevronLeft, X, Disc3 } from 'lucide-react';
import { MediaPlayer, type MediaPlayerTrack } from '@/components/media/MediaPlayer';
import type { Material } from '@/types';
import type { MusicPlayerViewer } from '@/context/MusicPlayerOverlayContext';
import { isPlayableAudioFile } from '@/utils/media';
import styles from './RepertoireMusicPlayerPage.module.scss';

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;
const FILE_BASE_URL = import.meta.env.VITE_S3_BUCKET_URL;

interface RepertoireItem {
  repertoireId: string;
  title: string;
  artist?: string;
}

export interface RepertoireMusicPlayerPanelProps {
  groupName: string;
  viewer: MusicPlayerViewer;
  onClose: () => void;
  shellTitleId?: string;
}

export function RepertoireMusicPlayerPanel({
  groupName,
  viewer,
  onClose,
  shellTitleId,
}: RepertoireMusicPlayerPanelProps) {
  const navigate = useNavigate();
  const [repertoires, setRepertoires] = useState<RepertoireItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerQueue, setPlayerQueue] = useState<MediaPlayerTrack[]>([]);
  const [playerStartIndex, setPlayerStartIndex] = useState(0);
  const [highlightedTrackIndex, setHighlightedTrackIndex] = useState(0);

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

  const fetchRepertoires = useCallback(async () => {
    if (!groupName) return;
    setLoadingList(true);
    setError(null);
    const token = localStorage.getItem('authToken');
    try {
      const res = await axios.get<RepertoireItem[]>(
        `${API_BASE_URL}/groups/${groupName}/repertoires`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setRepertoires(res.data ?? []);
    } catch (e) {
      console.error(e);
      setError('Kunde inte hämta repertoaren.');
    } finally {
      setLoadingList(false);
    }
  }, [groupName]);

  useEffect(() => {
    fetchRepertoires();
  }, [fetchRepertoires]);

  const fetchMaterials = useCallback(
    async (repertoireId: string) => {
      if (!groupName) return;
      setLoadingTracks(true);
      setError(null);
      const token = localStorage.getItem('authToken');
      try {
        const res = await axios.get<Material[]>(
          `${API_BASE_URL}/groups/${groupName}/repertoires/${repertoireId}/materials`,
          { headers: { Authorization: `Bearer ${token}` } }
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
    [groupName]
  );

  const handleSelectRepertoire = (id: string) => {
    setSelectedId(id);
    setPlayerQueue([]);
    fetchMaterials(id);
  };

  const buildTracksFromMaterials = useCallback((items: Material[]): MediaPlayerTrack[] => {
    return items
      .filter((m) => m.fileKey && isPlayableAudioFile(m.fileKey))
      .map((m) => ({
        src: `${FILE_BASE_URL}/${m.fileKey}`,
        title: m.title || m.fileKey?.split('/').pop() || 'Okänd',
      }));
  }, []);

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
    navigate(repertoiresHref);
    onClose();
  };

  const selectedTitle = repertoires.find((r) => r.repertoireId === selectedId)?.title;

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
            Repertoar
          </button>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Stäng musik"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
      </header>

      {/* ── body ── */}
      <div className={styles.shellBody}>
        {/* sidebar */}
        <aside className={styles.sidebar} aria-label="Repertoar">
          <h2 className={styles.sidebarTitle}>Ditt bibliotek</h2>
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

        {/* main */}
        <section className={styles.shellMain} aria-label="Spår och uppspelning">
          {!selectedId ? (
            /* ── welcome state ── */
            <div className={styles.emptyMain}>
              <Disc3 size={64} className={styles.emptyIcon} aria-hidden />
              <h2 className={styles.emptyTitle}>Välkommen till musikspelaren</h2>
              <p className={styles.emptyDescription}>
                Välj en låt i biblioteket till vänster för att lyssna på körens ljudfiler.
              </p>
            </div>
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
                  <p className={styles.heroEyebrow}>Repertoar</p>
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
                  <h2 className={styles.emptyTitle}>Inga ljudfiler</h2>
                  <p className={styles.emptyDescription}>
                    Det finns inga uppspelbara ljudfiler i den här låten ännu.
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
      </div>

      {error && <p className={styles.errorBanner}>{error}</p>}

      {/* ── player dock ── */}
      <div className={styles.playerDock} role="region" aria-label="Uppspelning">
        {playerQueue.length > 0 ? (
          <MediaPlayer
            key={`${selectedId}-${playerStartIndex}-${playerQueue.map((t) => t.src).join('|')}`}
            tracks={playerQueue}
            initialTrackIndex={playerStartIndex}
            autoAdvanceToNext
            variant="embedded"
            onTrackIndexChange={(i) => setHighlightedTrackIndex(i)}
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
