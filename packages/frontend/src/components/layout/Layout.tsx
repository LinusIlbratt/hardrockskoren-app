import React from 'react';
import styles from './Layout.module.scss';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  // Denna komponent sveper helt enkelt sitt innehåll i den stylade behållaren.
  return (
    <div className={styles.container}>
      {children}
    </div>
  );
};