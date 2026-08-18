"use client";

import { useMemo, useRef, useState } from "react";
import { MapPinned, X } from "lucide-react";
import Link from "next/link";
import type {
  LocationItineraryEntry,
  LocationItineraryIndex,
  LocationItineraryTalent
} from "@/modules/domain/types";
import { getTalentPath } from "@/lib/public-path";

function distanceFromToday(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.abs(Date.parse(`${value}T00:00:00+08:00`) - today.getTime());
}

export function compareLocationItineraryEntries(
  left: LocationItineraryEntry,
  right: LocationItineraryEntry
) {
  if (left.isPast !== right.isPast) return left.isPast ? 1 : -1;
  return distanceFromToday(left.date) - distanceFromToday(right.date);
}

export function getLocationItineraryRecency(entries: LocationItineraryEntry[]) {
  const futureEntries = entries.filter((entry) => !entry.isPast);
  const relevantEntries = futureEntries.length > 0 ? futureEntries : entries;
  return {
    hasFuture: futureEntries.length > 0,
    nearest: Math.min(...relevantEntries.map((entry) => distanceFromToday(entry.date)))
  };
}

function matchesLocation(entry: LocationItineraryEntry, provinceName: string, cityLabel: string) {
  return cityLabel ? entry.city === cityLabel : entry.province === provinceName;
}

export function getLocationItineraryRecencyForSelection(
  entries: LocationItineraryEntry[],
  provinceName: string,
  cityLabel: string
) {
  return getLocationItineraryRecency(
    entries.filter((entry) => matchesLocation(entry, provinceName, cityLabel))
  );
}

function ItineraryEntry({
  entry,
  matched
}: {
  entry: LocationItineraryEntry;
  matched: boolean;
}) {
  const stateClassName = entry.isPast && matched
    ? "border-[rgba(200,71,58,0.28)] border-l-[3px] border-l-[rgba(200,71,58,0.68)] bg-[var(--color-danger-soft)] text-[#7f332c]"
    : !entry.isPast && matched
      ? "border-[rgba(43,109,246,0.28)] bg-[rgba(43,109,246,0.07)]"
      : "border-[var(--line-soft)] bg-[var(--surface)] text-[var(--foreground-soft)]";
  const expiredLabelClassName = matched
    ? "border-[rgba(200,71,58,0.18)] bg-[rgba(200,71,58,0.1)] text-[var(--color-danger)]"
    : "border-[var(--line-soft)] bg-[var(--surface-tint)] text-[var(--foreground-muted)]";

  return (
    <div className={`rounded-[1rem] border px-4 py-3 text-sm leading-6 ${stateClassName}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span>{entry.rawText}</span>
        {entry.isPast ? (
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${expiredLabelClassName}`}>
            已过期
          </span>
        ) : null}
      </div>
    </div>
  );
}

function TalentItineraryCard({
  item,
  provinceName,
  cityLabel,
  onNavigate
}: {
  item: LocationItineraryTalent;
  provinceName: string;
  cityLabel: string;
  onNavigate: () => void;
}) {
  const futureEntries = item.entries.filter((entry) => !entry.isPast);
  const pastEntries = item.entries.filter((entry) => entry.isPast);

  return <article className="surface-strong rounded-[1.5rem] p-5">
    <div className="flex items-center justify-between gap-4">
      <Link href={getTalentPath(item.talent)} onClick={onNavigate} className="text-xl hover:text-[var(--color-accent)]">{item.talent.nickname}</Link>
      <span className="text-xs ui-muted">{item.entries.length} 条行程</span>
    </div>
    <div className="mt-4 space-y-5">
      {futureEntries.length ? <section aria-label="未来行程">
        <p className="mb-2 font-mono text-[0.68rem] font-semibold tracking-[0.12em] text-[var(--color-accent)]">未来行程</p>
        <div className="space-y-2">{futureEntries.map((entry, index) => <ItineraryEntry key={`${entry.rawText}-future-${index}`} entry={entry} matched={matchesLocation(entry, provinceName, cityLabel)} />)}</div>
      </section> : null}
      {pastEntries.length ? <section aria-label="过期行程">
        <p className="mb-2 font-mono text-[0.68rem] font-semibold tracking-[0.12em] text-[var(--color-danger)]">过期行程</p>
        <div className="space-y-2">{pastEntries.map((entry, index) => <ItineraryEntry key={`${entry.rawText}-past-${index}`} entry={entry} matched={matchesLocation(entry, provinceName, cityLabel)} />)}</div>
      </section> : null}
    </div>
  </article>;
}

export function LocationItineraryDialog({ data }: { data: LocationItineraryIndex }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const initialProvince = data.provinces.find((province) => province.label === "广东") ?? data.provinces[0];
  const [provinceName, setProvinceName] = useState(initialProvince?.name ?? "");
  const [cityLabel, setCityLabel] = useState("");
  const province = data.provinces.find((item) => item.name === provinceName);
  const results = useMemo(() => data.talents
    .map((item) => {
      const matchingEntries = item.entries.filter((entry) => matchesLocation(entry, provinceName, cityLabel));
      const recency = getLocationItineraryRecencyForSelection(item.entries, provinceName, cityLabel);
      return {
        ...item,
        entries: [...item.entries].sort(compareLocationItineraryEntries),
        matchingEntries,
        ...recency
      };
    })
    .filter((item) => item.matchingEntries.length > 0)
    .sort((left, right) =>
      Number(right.hasFuture) - Number(left.hasFuture) ||
      left.nearest - right.nearest ||
      left.talent.nickname.localeCompare(right.talent.nickname, "zh-CN")
    ), [cityLabel, data.talents, provinceName]);
  const futureResults = results.filter((item) => item.hasFuture);
  const pastResults = results.filter((item) => !item.hasFuture);

  return <>
    <button type="button" className="ui-button-secondary text-sm" onClick={() => dialogRef.current?.showModal()}><MapPinned className="h-4 w-4" aria-hidden="true" />按地点查看行程</button>
    <dialog ref={dialogRef} className="m-auto max-h-[90vh] w-[min(920px,calc(100%-2rem))] overflow-hidden rounded-[2rem] border border-[var(--line-strong)] bg-[var(--surface)] p-0 text-[var(--foreground)] shadow-[var(--shadow-strong)] backdrop:bg-[rgba(12,18,34,0.62)]">
      <div className="sticky top-0 z-10 border-b bg-[var(--surface)] px-5 py-5 ui-divider md:px-7">
        <div className="flex items-start justify-between gap-4"><div><p className="ui-kicker">主页行程索引</p><h2 className="mt-2 text-3xl tracking-[-0.03em]">按地点查看达人</h2><p className="mt-2 text-sm ui-subtle">先按省或城市找到达人，再查看她当前简介里的全部行程。</p></div><button type="button" className="ui-icon-button" aria-label="关闭地点行程" onClick={() => dialogRef.current?.close()}><X className="h-5 w-5" /></button></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="space-y-2 text-sm ui-subtle"><span className="block">省级地区</span><select className="ui-select" value={provinceName} onChange={(event) => { setProvinceName(event.target.value); setCityLabel(""); }}>{data.provinces.map((item) => <option key={item.name} value={item.name}>{item.label}</option>)}</select></label>
          <label className="space-y-2 text-sm ui-subtle"><span className="block">城市</span><select className="ui-select" value={cityLabel} onChange={(event) => setCityLabel(event.target.value)}><option value="">省内全部城市</option>{province?.cities.map((city) => <option key={city.name} value={city.label}>{city.label}</option>)}</select></label>
        </div>
      </div>
      <div className="max-h-[58vh] overflow-y-auto px-5 py-6 md:px-7">
        <p className="mb-4 font-mono text-sm ui-muted">{province?.label}{cityLabel ? ` · ${cityLabel}` : ""} / {results.length} 位达人</p>
        {results.length ? <div className="space-y-8">
          {futureResults.length ? <section aria-labelledby="future-itineraries-heading">
            <div className="mb-3 flex items-end justify-between gap-4 border-l-[3px] border-[var(--color-accent)] pl-3">
              <h3 id="future-itineraries-heading" className="text-xl">未来行程</h3>
              <span className="font-mono text-xs ui-muted">{futureResults.length} 位达人</span>
            </div>
            <div className="space-y-4">{futureResults.map((item) => <TalentItineraryCard key={item.talent.id} item={item} provinceName={provinceName} cityLabel={cityLabel} onNavigate={() => dialogRef.current?.close()} />)}</div>
          </section> : null}
          {pastResults.length ? <section aria-labelledby="past-itineraries-heading">
            <div className="mb-3 flex items-end justify-between gap-4 border-l-[3px] border-[var(--color-danger)] pl-3 text-[var(--color-danger)]">
              <h3 id="past-itineraries-heading" className="text-xl">过去行程</h3>
              <span className="font-mono text-xs">{pastResults.length} 位达人</span>
            </div>
            <div className="space-y-4">{pastResults.map((item) => <TalentItineraryCard key={item.talent.id} item={item} provinceName={provinceName} cityLabel={cityLabel} onNavigate={() => dialogRef.current?.close()} />)}</div>
          </section> : null}
        </div> : <p className="rounded-[1.5rem] border border-dashed border-[var(--line-strong)] px-5 py-10 text-center text-sm ui-subtle">当前地点没有可展示的主页行程。</p>}
      </div>
    </dialog>
  </>;
}
