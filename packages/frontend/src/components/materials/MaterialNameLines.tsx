import styles from './MaterialNameLines.module.scss';

type MaterialNameLinesProps = {
  primary: string;
  secondary?: string;
};

/** Två rader: fet stämma/kategori, undertitel under. */
export function MaterialNameLines({ primary, secondary }: MaterialNameLinesProps) {
  const subtitle = secondary?.trim() ?? '';
  return (
    <span className={styles.names}>
      <span className={styles.primary}>{primary}</span>
      {subtitle ? <span className={styles.secondary}>{subtitle}</span> : null}
    </span>
  );
}
