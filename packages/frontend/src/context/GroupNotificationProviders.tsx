import type { ReactNode } from "react";
import { EventNotificationProvider } from "@/context/EventNotificationContext";
import { MessageUnreadProvider } from "@/context/MessageUnreadContext";

type Props = {
  groupSlug: string | undefined;
  children: ReactNode;
};

/** Shared choir notification state (one poll each for events + messages). */
export function GroupNotificationProviders({ groupSlug, children }: Props) {
  return (
    <MessageUnreadProvider groupSlug={groupSlug}>
      <EventNotificationProvider groupSlug={groupSlug}>
        {children}
      </EventNotificationProvider>
    </MessageUnreadProvider>
  );
}
