import { useEffect } from "react";
import { useTour } from "@reactour/tour";

/**
 * Stänger touren automatiskt om användaren gör något annat
 * än att klicka i tourens navigation/popover.
 *
 * Använd: Lägg till i alla komponenter där en mini-tur finns.
 */
export function useCloseTourOnUserInteraction() {
  const { isOpen, setIsOpen } = useTour();

  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      // Kolla om klicket är i tourens popover (själva kortet/rutan)
      const popover = document.querySelector('[data-tour-popover]');
      if (popover && popover.contains(e.target as Node)) {
        return; // Låt klick i turen passera
      }
      setIsOpen(false); // Annars, stäng turen
    };

    document.addEventListener("mousedown", handleClick, true);

    return () => {
      document.removeEventListener("mousedown", handleClick, true);
    };
  }, [isOpen, setIsOpen]);
}
