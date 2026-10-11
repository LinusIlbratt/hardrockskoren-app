import { useState } from "react";
import { useParams } from "react-router-dom";
import { Info } from "lucide-react";
import { IoEyeOutline } from "react-icons/io5";
import { format, isPast } from "date-fns";
import { sv } from "date-fns/locale";
import { Stack } from "@/components/ui/layout/Stack";
import { Modal } from "@/components/ui/modal/Modal";
import { Tab, Tabs } from "@/components/ui/tabs/Tabs";
import { useAuth } from "@/context/AuthContext";
import { useMemberEvents } from "@/features/events/hooks/useMemberEvents";
import { SharedConcertSignupPanel } from "@/features/concerts";
import { useEventNotification } from "@/hooks/useEventNotification";
import type { Event } from "@/types";
import styles from "./MemberEventPage.module.scss";

export const MemberEventPage = () => {
  const { groupName } = useParams<{ groupName: string }>();
  const { user } = useAuth();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const {
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
  } = useMemberEvents(groupName);

  const {
    notificationData,
    markNewEventAsRead,
    markGeneralUpdateAsSeen,
    markDescriptionUpdateAsSeen,
  } = useEventNotification();

  const allNotificationIds = new Set([
    ...notificationData.newEventIds,
    ...Object.keys(notificationData.updatedEvents),
  ]);
  const hasRehearsalNotification = rehearsals.some((event) => allNotificationIds.has(event.eventId));
  const hasConcertNotification = concerts.some((event) => allNotificationIds.has(event.eventId));

  const renderEventItem = (event: Event) => {
    const startDate = new Date(event.eventDate);
    const endDate = new Date(event.endDate);
    const hasEventPassed = isPast(endDate);
    const isNextUpcoming = event.eventId === nextUpcomingEventId;

    const isNew = notificationData.newEventIds.includes(event.eventId);
    const updatedFields = notificationData.updatedEvents[event.eventId];
    const hasUnreadUpdate = !!updatedFields;
    const hasUnreadDescription = hasUnreadUpdate && updatedFields.includes("description");
    const hasOtherUnreadUpdates = hasUnreadUpdate && updatedFields.some((field) => field !== "description");

    const handleItemClick = () => {
      if (isNew) {
        void markNewEventAsRead(event.eventId);
      } else if (hasOtherUnreadUpdates) {
        void markGeneralUpdateAsSeen(event.eventId, event.updatedAt);
      }
    };

    const handleEyeClick = (clickEvent: React.MouseEvent) => {
      clickEvent.stopPropagation();
      if (hasUnreadDescription) {
        void markDescriptionUpdateAsSeen(event.eventId, event.descriptionUpdatedAt);
      }
      if (hasOtherUnreadUpdates) {
        void markGeneralUpdateAsSeen(event.eventId, event.updatedAt);
      }
      setEventToShowDescription(event);
    };

    const showRedEye = event.description && (isNew || hasUnreadDescription);
    const pulseTitle = hasOtherUnreadUpdates && updatedFields.includes("title");
    const pulseDate = hasOtherUnreadUpdates && (updatedFields.includes("eventDate") || updatedFields.includes("endDate"));
    const pulseTime = hasOtherUnreadUpdates && (updatedFields.includes("startTime") || updatedFields.includes("endTime"));

    const classNames = [
      styles.eventItem,
      hasEventPassed ? styles.pastEvent : "",
      isNextUpcoming ? styles.nextUpcomingEvent : "",
      (isNew || hasUnreadUpdate) ? styles.hasNotification : "",
      isNew ? styles.newEvent : "",
      hasOtherUnreadUpdates ? styles.updatedEvent : "",
    ].filter(Boolean).join(" ");

    return (
      <li key={event.eventId} className={classNames} onClick={handleItemClick}>
        <div className={styles.calendarBlock}>
          <span className={pulseDate ? styles.pulsingText : ""}>{format(startDate, "MMM", { locale: sv })}</span>
          <span className={pulseDate ? styles.pulsingText : ""}>{format(startDate, "d")}</span>
        </div>
        <Stack gap="xs" className={styles.itemDetails}>
          <span className={`${styles.itemTitle} ${pulseTitle ? styles.pulsingText : ""}`}>{event.title}</span>
          <span className={`${styles.itemTime} ${pulseTime ? styles.pulsingText : ""}`}>
            {`kl. ${format(startDate, "HH:mm")} – ${format(endDate, "HH:mm")}`}
          </span>
        </Stack>
        <div className={styles.actions}>
          {event.description && (
            <button
              className={`${styles.iconButton} ${showRedEye ? styles.pulsingRedEye : ""}`}
              onClick={handleEyeClick}
              title="Visa beskrivning"
              type="button"
            >
              <IoEyeOutline size={32} />
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <Stack gap="xl" className={styles.page}>
      <Stack gap="md" className={styles.header}>
        <div className={styles.titleRow}>
          <h2>Gig & Repdatum</h2>
          <button
            type="button"
            className={styles.infoButton}
            onClick={() => setIsHelpOpen(true)}
            aria-label="Så fungerar det"
            aria-expanded={isHelpOpen}
          >
            <Info size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <Tabs label="Gig och repdatum">
          <Tab active={activeTab === "REHEARSAL"} onSelect={() => setActiveTab("REHEARSAL")}>
            Rep
            {hasRehearsalNotification && <span className={styles.tabBadge} />}
          </Tab>
          <Tab active={activeTab === "CONCERT"} onSelect={() => setActiveTab("CONCERT")}>
            Gig
            {hasConcertNotification && <span className={styles.tabBadge} />}
          </Tab>
          <Tab active={activeTab === "SHARED"} onSelect={() => setActiveTab("SHARED")}>
            Gemensamma Gig
          </Tab>
        </Tabs>
      </Stack>

      {activeTab === "SHARED" ? (
        <SharedConcertSignupPanel
          preferredChoirSlug={groupName}
          userGroups={user?.groups ?? []}
          givenName={user?.given_name}
          familyName={user?.family_name}
        />
      ) : (
        <>
          {isLoading && <p>Laddar kommande händelser...</p>}
          {error && <p className={styles.error}>{error}</p>}
          {!isLoading && !error && (
            <section className={styles.listSection}>
              {eventsToDisplay.length > 0 ? (
                <Stack as="ul" gap="sm" className={styles.eventList}>
                  {eventsToDisplay.map(renderEventItem)}
                </Stack>
              ) : (
                <p>Det finns inga inplanerade händelser ännu.</p>
              )}
            </section>
          )}
        </>
      )}

      <Modal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        title="Så fungerar det"
        tone="luxury"
        size="compact"
      >
        <p className={styles.helpText}>
          Tryck på ögat <IoEyeOutline size={18} aria-hidden="true" /> för att läsa mer.
          Nya event har en ljusare bakgrund, och en pulserande detalj visar vad som har ändrats.
          Tryck på ett markerat event för att markera det som läst.
        </p>
      </Modal>

      <Modal
        isOpen={!!eventToShowDescription}
        onClose={() => setEventToShowDescription(null)}
        title={eventToShowDescription?.title || "Eventbeskrivning"}
      >
        <pre className={styles.descriptionText}>{eventToShowDescription?.description}</pre>
      </Modal>
    </Stack>
  );
};
