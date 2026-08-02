import type { MetadataRoute } from "next";
import { deriveEventTemporalStatus } from "@/lib/date";
import { getEventPath, getTalentPath } from "@/lib/public-path";
import { buildAbsoluteUrl } from "@/lib/site";
import { getContentState } from "@/modules/content/service";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const state = await getContentState();
  const staticRoutes = ["/", "/talents", "/events", "/ladder", "/search"];
  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((path) => ({
    url: buildAbsoluteUrl(path),
    lastModified: new Date(),
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.7
  }));

  return [
    ...staticEntries,
    ...state.talents.map((talent) => ({
      url: buildAbsoluteUrl(getTalentPath(talent)),
      lastModified: new Date(talent.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.8
    })),
    ...state.events.map((event) => ({
      url: buildAbsoluteUrl(getEventPath(event)),
      lastModified: new Date(event.updatedAt),
      changeFrequency:
        deriveEventTemporalStatus(event.startsAt, event.endsAt) === "future"
          ? ("daily" as const)
          : ("monthly" as const),
      priority: 0.8
    }))
  ];
}
