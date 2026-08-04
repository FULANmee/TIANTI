import { formatDateRange } from "@/lib/date";
import type { Event } from "@/modules/domain/types";

export function getEventDisplayName(event: Pick<Event, "name" | "city" | "startsAt" | "endsAt">) {
  const name = event.name.trim();
  if (name) {
    return name;
  }

  return [
    event.city.trim(),
    event.startsAt || event.endsAt ? formatDateRange(event.startsAt, event.endsAt) : null
  ]
    .filter(Boolean)
    .join(" · ");
}
