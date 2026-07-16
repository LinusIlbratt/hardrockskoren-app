import { Modal } from '@/components/ui/modal/Modal';
import { DiscardChangesConfirm } from '@/components/ui/form/DiscardChangesConfirm';
import { useModalFormGuard } from '@/hooks/useModalFormGuard';
import styles from '@/pages/member/RepertoireMusicPlayerPage.module.scss';

interface PlaylistTitleModalBodyProps {
  isBusy: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  isDirty: boolean;
  inputId: string;
  placeholder: string;
  submitLabel: string;
  busyLabel: string;
}

function PlaylistTitleModalBody({
  isBusy,
  value,
  onChange,
  onClose,
  onSubmit,
  isDirty,
  inputId,
  placeholder,
  submitLabel,
  busyLabel,
}: PlaylistTitleModalBodyProps) {
  const {
    showDiscardConfirm,
    requestClose,
    confirmDiscard,
    cancelDiscard,
  } = useModalFormGuard({ isDirty, isBlocked: isBusy, onCloseFallback: onClose });

  return (
    <>
      <label htmlFor={inputId} className={styles.playlistRenameLabel}>
        Namn
      </label>
      <input
        id={inputId}
        type="text"
        className={styles.playlistRenameInput}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={isBusy}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onSubmit();
          }
        }}
      />

      {showDiscardConfirm && (
        <DiscardChangesConfirm onConfirm={confirmDiscard} onCancel={cancelDiscard} />
      )}

      <div className={styles.playlistRenameModalFooter}>
        <button
          type="button"
          className={styles.playlistRenameModalButtonSecondary}
          onClick={requestClose}
          disabled={isBusy}
        >
          Avbryt
        </button>
        <button
          type="button"
          className={styles.playlistRenameModalButtonPrimary}
          onClick={onSubmit}
          disabled={isBusy || !value.trim()}
        >
          {isBusy ? busyLabel : submitLabel}
        </button>
      </div>
    </>
  );
}

interface CreatePlaylistModalProps {
  isOpen: boolean;
  isBusy: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function CreatePlaylistModal({
  isOpen,
  isBusy,
  value,
  onChange,
  onClose,
  onSubmit,
}: CreatePlaylistModalProps) {
  return (
    <Modal formMode isOpen={isOpen} onClose={onClose} title="Ny spellista">
      <PlaylistTitleModalBody
        isBusy={isBusy}
        value={value}
        onChange={onChange}
        onClose={onClose}
        onSubmit={onSubmit}
        isDirty={value.trim().length > 0}
        inputId="mobile-new-playlist-title"
        placeholder="Min spellista"
        submitLabel="Skapa"
        busyLabel="Skapar…"
      />
    </Modal>
  );
}

interface RenamePlaylistModalProps {
  isOpen: boolean;
  isBusy: boolean;
  value: string;
  initialTitle: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function RenamePlaylistModal({
  isOpen,
  isBusy,
  value,
  initialTitle,
  onChange,
  onClose,
  onSubmit,
}: RenamePlaylistModalProps) {
  const isDirty = value.trim() !== initialTitle.trim();

  return (
    <Modal formMode isOpen={isOpen} onClose={onClose} title="Byt namn på spellista">
      <PlaylistTitleModalBody
        isBusy={isBusy}
        value={value}
        onChange={onChange}
        onClose={onClose}
        onSubmit={onSubmit}
        isDirty={isDirty}
        inputId="playlist-rename-input"
        placeholder="Min spellista"
        submitLabel="Spara"
        busyLabel="Sparar…"
      />
    </Modal>
  );
}
