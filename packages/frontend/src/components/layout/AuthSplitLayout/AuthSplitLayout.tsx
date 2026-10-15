import type { ReactNode } from 'react';
import { LoginPoster } from '@/components/layout/LoginPoster';
import logoImage from '@/assets/images/hrk-logo.webp';
import styles from './AuthSplitLayout.module.scss';

interface AuthSplitLayoutProps {
  children: ReactNode;
  /** Tätare logotyp och formulärkort. Används på registrering. */
  compact?: boolean;
}

export const AuthSplitLayout = ({ children, compact = false }: AuthSplitLayoutProps) => {
  const columnClass = [styles.container, compact && styles.containerCompact].filter(Boolean).join(' ');
  const logoClass = compact ? styles.logoCompact : styles.logo;
  const formClass = [styles.formWrapper, compact && styles.formCard].filter(Boolean).join(' ');

  return (
    <main className={styles.page}>
      <div className={columnClass}>
        <figure className={logoClass}>
          <img src={logoImage} alt="Logo för Hårdrockskören" />
        </figure>
        <div className={formClass}>{children}</div>
      </div>
      <div className={styles.poster}>
        <LoginPoster />
      </div>
    </main>
  );
};
