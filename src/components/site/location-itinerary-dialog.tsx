"use client";

import { useMemo, useRef, useState } from "react";
import { MapPinned, X } from "lucide-react";
import Link from "next/link";
import type { LocationItineraryIndex } from "@/modules/domain/types";
import { getTalentPath } from "@/lib/public-path";

function distanceFromToday(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.abs(Date.parse(`${value}T00:00:00+08:00`) - today.getTime());
}

export function LocationItineraryDialog({ data }: { data: LocationItineraryIndex }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const initialProvince = data.provinces.find((province) => province.label === "广东") ?? data.provinces[0];
  const [provinceName, setProvinceName] = useState(initialProvince?.name ?? "");
  const [cityLabel, setCityLabel] = useState("");
  const province = data.provinces.find((item) => item.name === provinceName);
  const results = useMemo(() => data.talents
    .filter((item) => item.entries.some((entry) => cityLabel ? entry.city === cityLabel : entry.province === provinceName))
    .map((item) => ({
      ...item,
      entries: [...item.entries].sort((left, right) => distanceFromToday(left.date) - distanceFromToday(right.date) || (left.isPast === right.isPast ? 0 : left.isPast ? 1 : -1)),
      nearest: Math.min(...item.entries.filter((entry) => cityLabel ? entry.city === cityLabel : entry.province === provinceName).map((entry) => distanceFromToday(entry.date)))
    }))
    .sort((left, right) => left.nearest - right.nearest || left.talent.nickname.localeCompare(right.talent.nickname, "zh-CN")), [cityLabel, data.talents, provinceName]);

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
        <div className="space-y-4">{results.length ? results.map((item) => <article key={item.talent.id} className="surface-strong rounded-[1.5rem] p-5"><div className="flex items-center justify-between gap-4"><Link href={getTalentPath(item.talent)} onClick={() => dialogRef.current?.close()} className="text-xl hover:text-[var(--color-accent)]">{item.talent.nickname}</Link><span className="text-xs ui-muted">{item.entries.length} 条行程</span></div><div className="mt-4 space-y-2">{item.entries.map((entry, index) => { const matched = cityLabel ? entry.city === cityLabel : entry.province === provinceName; return <div key={`${entry.rawText}-${index}`} className={`rounded-[1rem] border px-4 py-3 text-sm leading-6 ${matched ? "border-[rgba(43,109,246,0.28)] bg-[rgba(43,109,246,0.07)]" : "border-[var(--line-soft)]"} ${entry.isPast ? "opacity-60" : ""}`}><div className="flex flex-wrap justify-between gap-2"><span>{entry.rawText}</span>{entry.isPast ? <span className="text-xs ui-muted">已过期</span> : null}</div></div>; })}</div></article>) : <p className="rounded-[1.5rem] border border-dashed border-[var(--line-strong)] px-5 py-10 text-center text-sm ui-subtle">当前地点没有可展示的主页行程。</p>}</div>
      </div>
    </dialog>
  </>;
}
