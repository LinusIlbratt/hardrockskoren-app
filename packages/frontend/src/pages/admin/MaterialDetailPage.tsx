import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FiFolder, FiMusic, FiFileText, FiFile, FiTrash2, FiRefreshCw, FiInbox } from 'react-icons/fi';
import { Cluster } from '@/components/ui/layout/Cluster';
import { Stack } from '@/components/ui/layout/Stack';
import { Modal } from '@/components/ui/modal/Modal';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { AddLibraryFolderToChoirsModal } from '@/components/media/AddLibraryFolderToChoirsModal';
import { MAX_FILES_PER_BATCH_UPLOAD, useMaterialFolder, useMaterialUploader } from '@/features/materials';
import styles from './MaterialDetailPage.module.scss';

const getIconForFile = (fileName: string, iconClass: string) => {
  if (/\.(mp3|wav|m4a|ogg)$/i.test(fileName)) return <FiMusic className={iconClass} aria-hidden />;
  if (/\.(pdf|txt|doc|docx)$/i.test(fileName)) return <FiFileText className={iconClass} aria-hidden />;
  return <FiFile className={iconClass} aria-hidden />;
};

export const MaterialDetailPage = () => {
  const { folderPath } = useParams<{ folderPath?: string }>();
  const decodedPath = useMemo(() => (folderPath ? decodeURIComponent(folderPath) : ''), [folderPath]);

  const folder = useMaterialFolder(decodedPath);
  const uploader = useMaterialUploader(decodedPath, () => folder.loadMaterials({ silent: true }));

  const {
    isLoading,
    error,
    replaceStatus: folderStatus,
    statusAt: folderStatusAt,
    setReplaceStatus,
    deletingMaterialId,
    isSyncing,
    syncConfirmOpen,
    setSyncConfirmOpen,
    addToChoirsOpen,
    setAddToChoirsOpen,
    materialPendingDelete,
    setMaterialPendingDelete,
    selectedMaterialIds,
    batchDeleteTargets,
    setBatchDeleteTargets,
    isBatchDeleting,
    performConfirmedDelete,
    performConfirmedBatchDelete,
    performSyncAllRepertoires,
    directoryItems,
    fileItemsInFolder,
    fileIdsInFolder,
    allFilesInFolderSelected,
    selectAllCheckboxRef,
    toggleMaterialSelected,
    handleSelectAllFilesToggle,
    openBatchDeleteConfirm,
    breadcrumbs,
  } = folder;

  const {
    replacingMaterialId,
    isAddingFile,
    addFilesProgress,
    fileInputRefs,
    addFileInputRef,
    handleReplaceFile,
    handleAddFiles,
    replaceStatus: uploaderStatus,
    statusAt: uploaderStatusAt,
    isBusy: isUploaderBusy,
  } = uploader;

  const replaceStatus = folderStatusAt >= uploaderStatusAt ? folderStatus : uploaderStatus;
  const rowBusy = isUploaderBusy || !!deletingMaterialId || isBatchDeleting;

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.pageInner}>
          <div className={`${styles.pageState} ${styles.pageStateLoading}`}>
            <span className={styles.loadingPulse}>Laddar material…</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.pageInner}>
          <div className={`${styles.pageState} ${styles.pageStateError}`}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageInner}>
      <Link to="/admin/globalMaterial" className={styles.backLink}>
        ← Tillbaka till Material
      </Link>

      <header className={styles.headerCard}>
        <h1 className={styles.pageTitle}>{breadcrumbs[breadcrumbs.length - 1] || 'Mediabibliotek'}</h1>
        {breadcrumbs.length === 1 && (
          <div className={styles.choirActions}>
            <button
              type="button"
              className={styles.addToChoirsButton}
              onClick={() => setAddToChoirsOpen(true)}
            >
              Lägg till i körer
            </button>
            <button
              type="button"
              className={styles.syncButton}
              disabled={isSyncing}
              onClick={() => setSyncConfirmOpen(true)}
            >
              {isSyncing ? 'Synkar...' : 'Synka körer'}
            </button>
          </div>
        )}
      </header>

      {isAddingFile && addFilesProgress ? (
        <div
          className={styles.uploadProgressPanel}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={
            addFilesProgress.phase === 'preparing' ? 0 : addFilesProgress.percent
          }
          aria-label={
            addFilesProgress.phase === 'preparing'
              ? 'Förbereder uppladdning'
              : `Uppladdning ${addFilesProgress.percent} procent`
          }
          aria-live="polite"
        >
          <div className={styles.uploadProgressTop}>
            <span className={styles.uploadProgressTitle}>
              {addFilesProgress.phase === 'preparing'
                ? 'Förbereder uppladdning…'
                : addFilesProgress.percent < 100
                  ? `Laddar upp till mediabiblioteket…`
                  : 'Slutför…'}
            </span>
            <span className={styles.uploadProgressMeta}>
              {addFilesProgress.totalFiles}{' '}
              {addFilesProgress.totalFiles === 1 ? 'fil' : 'filer'}
              {addFilesProgress.phase === 'uploading' ? (
                <span className={styles.uploadProgressPercent}>
                  {' '}
                  · {addFilesProgress.percent}%
                </span>
              ) : null}
            </span>
          </div>
          <div className={styles.uploadProgressTrack}>
            {addFilesProgress.phase === 'preparing' ? (
              <div className={styles.uploadProgressIndeterminate} />
            ) : (
              <div
                className={styles.uploadProgressFill}
                style={{ width: `${addFilesProgress.percent}%` }}
              />
            )}
          </div>
        </div>
      ) : null}

      {replaceStatus ? (
        <div className={`${styles.statusMessage} ${styles[replaceStatus.type]}`} role="status">
          {replaceStatus.message}
        </div>
      ) : null}

      {breadcrumbs.length === 1 && decodedPath ? (
        <AddLibraryFolderToChoirsModal
          folderPath={decodedPath}
          isOpen={addToChoirsOpen}
          onClose={() => setAddToChoirsOpen(false)}
          onSuccess={(message) =>
            setReplaceStatus({ type: 'success', message })
          }
        />
      ) : null}

      <Modal
        isOpen={syncConfirmOpen}
        onClose={() => {
          if (!isSyncing) setSyncConfirmOpen(false);
        }}
        title="Synka körer?"
        tone="library"
      >
        <div className={styles.syncModalBody}>
          <p>
            Vill du att låten <strong>{decodedPath}</strong> ska se likadan ut i alla körer som använder den?
          </p>
          <p className={styles.syncModalHint}>
            Då hämtar vi innehållet från mediabiblioteket till varje körs repertoar. Nya filer du lagt till här
            blir synliga för medlemmarna, och filer du tagit bort här försvinner också där.
          </p>
          <Cluster justify="end" gap="sm" className={styles.syncModalActions}>
            <Button
              type="button"
              variant={ButtonVariant.Ghost}
              disabled={isSyncing}
              onClick={() => setSyncConfirmOpen(false)}
            >
              Avbryt
            </Button>
            <Button
              type="button"
              variant={ButtonVariant.Primary}
              isLoading={isSyncing}
              onClick={() => void performSyncAllRepertoires()}
            >
              Ja, synka
            </Button>
          </Cluster>
        </div>
      </Modal>

      <Modal
        isOpen={!!materialPendingDelete}
        onClose={() => {
          if (!deletingMaterialId) setMaterialPendingDelete(null);
        }}
        title="Ta bort fil?"
      >
        <div className={styles.syncModalBody}>
          <p>
            Vill du ta bort <strong>{materialPendingDelete?.title || materialPendingDelete?.filePath.split('/').pop() || 'filen'}</strong>{' '}
            från mediabiblioteket?
          </p>
          <p className={styles.syncModalHint}>Detta går inte att ångra.</p>
          <Cluster justify="end" gap="sm" className={styles.syncModalActions}>
            <Button
              type="button"
              variant={ButtonVariant.Ghost}
              disabled={!!deletingMaterialId}
              onClick={() => setMaterialPendingDelete(null)}
            >
              Avbryt
            </Button>
            <Button
              type="button"
              variant={ButtonVariant.Destructive}
              isLoading={
                !!materialPendingDelete && deletingMaterialId === materialPendingDelete.materialId
              }
              onClick={() => void performConfirmedDelete()}
            >
              Ta bort
            </Button>
          </Cluster>
        </div>
      </Modal>

      <Modal
        isOpen={batchDeleteTargets.length > 0}
        onClose={() => {
          if (!isBatchDeleting) setBatchDeleteTargets([]);
        }}
        title={
          batchDeleteTargets.length === 1
            ? 'Ta bort 1 fil?'
            : `Ta bort ${batchDeleteTargets.length} filer?`
        }
      >
        <div className={styles.syncModalBody}>
          <p>Följande tas bort från mediabiblioteket:</p>
          <ul className={styles.batchDeleteNameList}>
            {batchDeleteTargets.slice(0, 18).map((m) => (
              <li key={m.materialId}>
                {m.title || m.filePath.split('/').pop() || m.materialId}
              </li>
            ))}
          </ul>
          {batchDeleteTargets.length > 18 ? (
            <p className={styles.syncModalHint}>
              … och {batchDeleteTargets.length - 18} till
            </p>
          ) : null}
          <p className={styles.syncModalHint}>Detta går inte att ångra.</p>
          <Cluster justify="end" gap="sm" className={styles.syncModalActions}>
            <Button
              type="button"
              variant={ButtonVariant.Ghost}
              disabled={isBatchDeleting}
              onClick={() => setBatchDeleteTargets([])}
            >
              Avbryt
            </Button>
            <Button
              type="button"
              variant={ButtonVariant.Destructive}
              isLoading={isBatchDeleting}
              onClick={() => void performConfirmedBatchDelete()}
            >
              Ta bort alla
            </Button>
          </Cluster>
        </div>
      </Modal>

      <section className={styles.listShell} aria-label="Mappinnehåll">
      <div className={styles.listToolbar}>
        <div className={styles.toolbarLead}>
          <span className={styles.fileCount}>
            {fileItemsInFolder.length} {fileItemsInFolder.length === 1 ? 'fil' : 'filer'}
          </span>
          {fileItemsInFolder.length > 0 ? (
            <label className={styles.selectAllLabel}>
              <input
                ref={selectAllCheckboxRef}
                type="checkbox"
                checked={allFilesInFolderSelected}
                disabled={rowBusy || fileIdsInFolder.length === 0}
                onChange={() => handleSelectAllFilesToggle()}
              />
              Markera alla
            </label>
          ) : null}
        </div>
        <div className={styles.toolbarAdd}>
          <input
            ref={addFileInputRef}
            className={styles.hiddenFileInput}
            type="file"
            multiple
            aria-describedby="add-files-hint"
            onChange={(e) => {
              void handleAddFiles(e.target.files);
              e.currentTarget.value = '';
            }}
          />
          <button
            type="button"
            className={styles.addFileButton}
            disabled={isAddingFile}
            onClick={() => addFileInputRef.current?.click()}
          >
            {isAddingFile && addFilesProgress?.phase === 'uploading'
              ? `Laddar upp ${addFilesProgress.percent}%`
              : isAddingFile
                ? 'Förbereder…'
                : '+ Lägg till filer'}
          </button>
          <p id="add-files-hint" className={styles.addFilesHint}>
            Max {MAX_FILES_PER_BATCH_UPLOAD} filer
          </p>
        </div>
      </div>
      {selectedMaterialIds.length > 0 ? (
        <button
          type="button"
          className={styles.removeSelectedButton}
          disabled={rowBusy}
          onClick={() => openBatchDeleteConfirm()}
        >
          Ta bort markerade ({selectedMaterialIds.length})
        </button>
      ) : null}
      <Stack gap="sm" className={styles.itemList}>
        {directoryItems.length > 0 ? (
          directoryItems.map(item => (
            item.type === 'folder' ? (
              <Link to={`/admin/globalMaterial/${encodeURIComponent(item.path)}`} key={item.path} className={`${styles.itemRow} ${styles.itemRowFolder}`}>
                <span className={`${styles.itemIconWrap} ${styles.itemIconWrapFolder}`} aria-hidden>
                  <FiFolder className={styles.itemIconSvg} />
                </span>
                <span className={styles.itemName}>{item.name}</span>
              </Link>
            ) : (
              <div
                key={item.material.materialId}
                className={`${styles.itemRow} ${styles.itemRowFile} ${
                  selectedMaterialIds.includes(item.material.materialId) ? styles.itemRowSelected : ''
                }`}
              >
                <div className={styles.fileLead}>
                  <input
                    type="checkbox"
                    className={styles.rowSelectCheckbox}
                    checked={selectedMaterialIds.includes(item.material.materialId)}
                    disabled={rowBusy}
                    onChange={() => toggleMaterialSelected(item.material.materialId)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Markera ${item.material.title || item.material.filePath.split('/').pop() || 'fil'}`}
                  />
                  <span className={styles.itemIconWrap} aria-hidden>
                    {getIconForFile(item.material.filePath, styles.itemIconSvg)}
                  </span>
                  <span className={styles.itemName}>{item.material.title || item.material.filePath.split('/').pop()}</span>
                </div>
                <div className={styles.itemActions}>
                  <input
                    ref={(el) => {
                      fileInputRefs.current[item.material.materialId] = el;
                    }}
                    className={styles.hiddenFileInput}
                    type="file"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      void handleReplaceFile(item.material, f);
                      e.currentTarget.value = '';
                    }}
                  />
                  <button
                    type="button"
                    className={styles.replaceButton}
                    disabled={
                      replacingMaterialId === item.material.materialId ||
                      deletingMaterialId === item.material.materialId ||
                      isBatchDeleting
                    }
                    aria-label={
                      replacingMaterialId === item.material.materialId
                        ? 'Ersätter fil'
                        : 'Ersätt fil'
                    }
                    title="Ersätt fil"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRefs.current[item.material.materialId]?.click();
                    }}
                  >
                    <FiRefreshCw aria-hidden size={16} />
                  </button>
                  <button
                    type="button"
                    className={styles.deleteFileButton}
                    disabled={
                      deletingMaterialId === item.material.materialId ||
                      replacingMaterialId === item.material.materialId ||
                      isBatchDeleting
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      setBatchDeleteTargets([]);
                      setMaterialPendingDelete(item.material);
                    }}
                    aria-label={`Ta bort ${item.material.title || item.material.filePath.split('/').pop()}`}
                  >
                    {deletingMaterialId === item.material.materialId ? 'Tar bort...' : <FiTrash2 aria-hidden />}
                  </button>
                </div>
              </div>
            )
          ))
        ) : (
          <div className={styles.emptyState}>
            <span className={styles.emptyStateIcon} aria-hidden>
              <FiInbox />
            </span>
            <p className={styles.emptyStateTitle}>Inget här ännu</p>
            <p className={styles.emptyStateHint}>
              Lägg till filer med knappen ovan, eller öppna en annan mapp.
            </p>
          </div>
        )}
      </Stack>
      </section>
      </div>
    </div>
  );
};