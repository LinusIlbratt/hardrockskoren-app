import { useEffect, useMemo, useState } from "react";
import { isPast } from "date-fns";
import { listEvents } from "@/services/eventService";
import type { Event } from "@/types";
import { getApiErrorMessage, isAbortError } from "@/utils/apiError";

export type MemberEventTab = "REHEARSAL" | "CONCERT" | "SHARED";

export function useMemberEvents(groupSlug: string | undefined) {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MemberEventTab>("REHEARSAL");
  const [eventToShowDescription, setEventToShowDescription] = useState<Event | null>(null);
  const [nextUpcomingEventId, setNextUpcomingEventId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setEventToShowDescription(null);
    setError(null);

    const slug = groupSlug?.trim();
    if (!slug) {
      setEvents([]);
      setNextUpcomingEventId(null);
      setIsLoading(false);
      setError("Kunde inte identifiera din kör.");
      return () => {
        active = false;
        controller.abort();
      };
    }

    setIsLoading(true);
    listEvents(slug, undefined, { signal: controller.signal })
      .then((data) => {
        if (!active) return;
        const sorted = [...data].sort(
          (a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
        );
        setEvents(sorted);
        const nextEvent = sorted.find((event) => !isPast(new Date(event.endDate)));
        setNextUpcomingEventId(nextEvent?.eventId ?? null);
      })
      .catch((err: unknown) => {
        if (!active || isAbortError(err)) return;
        setEvents([]);
        setNextUpcomingEventId(null);
        setError(getApiErrorMessage(err, "Kunde inte hämta event."));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [groupSlug]);

  const rehearsals = useMemo(
    () => events.filter((event) => event.eventType === "REHEARSAL"),
    [events]
  );
  const concerts = useMemo(
    () => events.filter((event) => event.eventType === "CONCERT"),
    [events]
  );

  const eventsToDisplay = activeTab === "REHEARSAL"
    ? rehearsals
    : activeTab === "CONCERT"
      ? concerts
      : [];

  return {
    events,
    rehearsals,
    concerts,
    eventsToDisplay,
    isLoading,
    error,
    activeTab,
    setActiveTab,
    eventToShowDescription,
    setEventToShowDescription,
    nextUpcomingEventId,
  };
}
