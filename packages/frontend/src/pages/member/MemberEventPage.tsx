import { useParams } from "react-router-dom";
import { IoEyeOutline, IoInformationCircleOutline } from "react-icons/io5";
import { format, isPast } from "date-fns";
import { sv } from "date-fns/locale";
import { Cluster } from "@/components/ui/layout/Cluster";
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
        <h2>Gig & Repdatum</h2>
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

      {activeTab !== "SHARED" && (
        <Cluster align="start" gap="md" className={styles.legend}>
          <IoInformationCircleOutline size={20} className={styles.legendIcon} />
          <p className={styles.legendText}>
            Tryck på ögat <IoEyeOutline size={20} className={styles.inlineIcon} /> för att läsa mer.
            Nya event har en ljusare bakgrund, medan en pulserande detalj visar exakt vad som har ändrats.
            Klicka på ett markerat event för att markera det som läst.
          </p>
        </Cluster>
      )}

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
        isOpen={!!eventToShowDescription}
        onClose={() => setEventToShowDescription(null)}
        title={eventToShowDescription?.title || "Eventbeskrivning"}
      >
        <pre className={styles.descriptionText}>{eventToShowDescription?.description}</pre>
      </Modal>
    </Stack>
  );
};
