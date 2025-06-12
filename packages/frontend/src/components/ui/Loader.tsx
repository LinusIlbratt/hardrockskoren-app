import styles from './Loader.module.scss';

export enum LoaderSize {
  "SMALL" = "small",
  "REGULAR" = "regular",
  "MEDIUM" = "medium",
  "LARGE" = "large",
}

/**
 * En helsides-loader som centrerar en stor laddningsikon mitt på skärmen.
 */
export const PageLoader = () => {
  return (
    // Använder 'styles.pageLoader' från din SCSS-modul
    <section className={styles.pageLoader}>
      <Loader size={LoaderSize.LARGE} />
    </section>
  );
};

type LoaderProps = {
  size?: LoaderSize;
};

/**
 * En återanvändbar laddningsikon som kan ha olika storlekar.
 */
export const Loader = ({ size = LoaderSize.REGULAR }: LoaderProps) => {
  // Bygger klassnamnet dynamiskt med hjälp av styles-objektet.
  // Detta blir t.ex. styles.loader__large
  const loaderClass = styles[`loader__${size}`];
  
  return <div className={loaderClass} />;
};