import { useCallback, useState } from 'react';
import type { MaterialNotice } from '@/features/materials/types';

export function useMaterialNotice() {
  const [replaceStatus, setReplaceStatusState] = useState<MaterialNotice | null>(null);
  const [statusAt, setStatusAt] = useState(0);

  const setReplaceStatus = useCallback((next: MaterialNotice | null) => {
    setReplaceStatusState(next);
    setStatusAt(performance.now());
  }, []);

  return { replaceStatus, statusAt, setReplaceStatus };
}
