import { describe, expect, it } from "vitest";
import {
  concertClosesAt,
  isNotificationWindowClosed,
  rehearsalClosesAt,
  stockholmMidnightUtc,
} from "./notificationWindow";

describe("stockholmMidnightUtc", () => {
  it("maps summer midnight (CEST, UTC+2)", () => {
    expect(stockholmMidnightUtc({ year: 2026, month: 10, day: 12 }).toISOString()).toBe(
      "2026-10-11T22:00:00.000Z"
    );
  });

  it("maps winter midnight (CET, UTC+1)", () => {
    expect(stockholmMidnightUtc({ year: 2026, month: 1, day: 12 }).toISOString()).toBe(
      "2026-01-11T23:00:00.000Z"
    );
  });

  it("maps the Monday after the autumn clock change to CET", () => {
    // 25 okt 2026 är sista söndagen i oktober; 03:00 går klockan tillbaka.
    // Måndag 26 okt 00:00 är därför vintertid.
    expect(stockholmMidnightUtc({ year: 2026, month: 10, day: 26 }).toISOString()).toBe(
      "2026-10-25T23:00:00.000Z"
    );
  });
});

describe("REHEARSAL window", () => {
  const tuesdayRehearsal = {
    eventType: "REHEARSAL",
    eventDate: "2026-10-06T16:00:00.000Z",
    endDate: "2026-10-06T18:00:00.000Z",
  };

  it("stays open through Sunday 23:59:59 Stockholm", () => {
    expect(rehearsalClosesAt({ year: 2026, month: 10, day: 6 }).toISOString()).toBe(
      "2026-10-11T22:00:00.000Z"
    );
    expect(
      isNotificationWindowClosed(tuesdayRehearsal, new Date("2026-10-11T21:59:59.000Z"))
    ).toBe(false);
  });

  it("closes at Monday 00:00:00 Stockholm the following week", () => {
    expect(
      isNotificationWindowClosed(tuesdayRehearsal, new Date("2026-10-11T22:00:00.000Z"))
    ).toBe(true);
  });

  it("keeps a Monday rehearsal until the next Monday, not the same morning", () => {
    const monday = {
      eventType: "REHEARSAL",
      eventDate: "2026-10-05T16:00:00.000Z",
    };
    expect(
      isNotificationWindowClosed(monday, new Date("2026-10-05T06:00:00.000Z"))
    ).toBe(false);
    expect(rehearsalClosesAt({ year: 2026, month: 10, day: 5 }).toISOString()).toBe(
      "2026-10-11T22:00:00.000Z"
    );
  });

  it("closes a Sunday rehearsal at the following Monday 00:00", () => {
    const sunday = {
      eventType: "REHEARSAL",
      eventDate: "2026-10-11T16:00:00.000Z",
    };
    expect(
      isNotificationWindowClosed(sunday, new Date("2026-10-11T21:59:59.000Z"))
    ).toBe(false);
    expect(
      isNotificationWindowClosed(sunday, new Date("2026-10-11T22:00:00.000Z"))
    ).toBe(true);
  });

  it("uses CET on the Monday after the autumn clock change", () => {
    const fridayBeforeFallback = {
      eventType: "REHEARSAL",
      eventDate: "2026-10-23T16:00:00.000Z",
    };
    expect(rehearsalClosesAt({ year: 2026, month: 10, day: 23 }).toISOString()).toBe(
      "2026-10-25T23:00:00.000Z"
    );
    expect(
      isNotificationWindowClosed(
        fridayBeforeFallback,
        new Date("2026-10-25T22:59:59.000Z")
      )
    ).toBe(false);
    expect(
      isNotificationWindowClosed(
        fridayBeforeFallback,
        new Date("2026-10-25T23:00:00.000Z")
      )
    ).toBe(true);
  });

  it("uses CET for a winter Sunday/Monday boundary", () => {
    const wednesday = {
      eventType: "REHEARSAL",
      eventDate: "2026-01-07T17:00:00.000Z",
    };
    expect(rehearsalClosesAt({ year: 2026, month: 1, day: 7 }).toISOString()).toBe(
      "2026-01-11T23:00:00.000Z"
    );
    expect(
      isNotificationWindowClosed(wednesday, new Date("2026-01-11T22:59:59.000Z"))
    ).toBe(false);
    expect(
      isNotificationWindowClosed(wednesday, new Date("2026-01-11T23:00:00.000Z"))
    ).toBe(true);
  });
});

describe("CONCERT window", () => {
  const saturdayGig = {
    eventType: "CONCERT",
    eventDate: "2026-10-10T18:00:00.000Z",
    endDate: "2026-10-10T21:00:00.000Z",
  };

  it("stays open through the gig's Stockholm calendar day", () => {
    expect(concertClosesAt({ year: 2026, month: 10, day: 10 }).toISOString()).toBe(
      "2026-10-10T22:00:00.000Z"
    );
    expect(
      isNotificationWindowClosed(saturdayGig, new Date("2026-10-10T21:59:59.000Z"))
    ).toBe(false);
  });

  it("closes at 00:00:00 Stockholm the day after", () => {
    expect(
      isNotificationWindowClosed(saturdayGig, new Date("2026-10-10T22:00:00.000Z"))
    ).toBe(true);
  });

  it("uses the later of eventDate and endDate when the gig crosses midnight", () => {
    const overnight = {
      eventType: "CONCERT",
      eventDate: "2026-10-10T20:00:00.000Z",
      endDate: "2026-10-10T23:30:00.000Z",
    };
    expect(
      isNotificationWindowClosed(overnight, new Date("2026-10-10T22:00:00.000Z"))
    ).toBe(false);
    expect(concertClosesAt({ year: 2026, month: 10, day: 11 }).toISOString()).toBe(
      "2026-10-11T22:00:00.000Z"
    );
    expect(
      isNotificationWindowClosed(overnight, new Date("2026-10-11T22:00:00.000Z"))
    ).toBe(true);
  });
});

describe("events the window cannot date", () => {
  const now = new Date("2026-10-11T22:00:00.000Z");

  it("keeps unknown types and undated events visible", () => {
    expect(isNotificationWindowClosed({ eventType: "OTHER", eventDate: "2020-01-01T00:00:00.000Z" }, now)).toBe(false);
    expect(isNotificationWindowClosed({ eventType: "REHEARSAL" }, now)).toBe(false);
    expect(isNotificationWindowClosed({ eventType: "CONCERT", eventDate: "not-a-date" }, now)).toBe(false);
  });
});
