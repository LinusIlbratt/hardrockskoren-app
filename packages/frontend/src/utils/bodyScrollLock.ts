/**
 * Räknar aktiva scroll-lås så att flera overlays inte krockar med body.style.overflow.
 */
let lockCount = 0;
let previousOverflow = '';

export function lockBodyScroll(): void {
  lockCount += 1;
  if (lockCount === 1) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
}

export function unlockBodyScroll(): void {
  if (lockCount <= 0) return;
  lockCount -= 1;
  if (lockCount === 0) {
    document.body.style.overflow = previousOverflow;
  }
}
