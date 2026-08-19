import type { TalentDetail } from "@/modules/domain/types";

const SERIES_COLORS = ["#2b6df6", "#b13b45"];

export function BeautyTierChart({ series }: { series: TalentDetail["beautyTierSeries"] }) {
  const keys = [...new Map(series.flatMap((item) => item.points).map((point) => [`${point.date}:${point.eventName}`, point])).entries()]
    .sort(([, left], [, right]) => left.date.localeCompare(right.date) || left.eventName.localeCompare(right.eventName, "zh-CN"));
  const visibleKeys = keys.slice(-10);
  if (!keys.length) return null;
  const width = Math.max(480, visibleKeys.length * 76 + 88);
  const left = 58;
  const top = 14;
  const plotHeight = 112;
  const step = visibleKeys.length > 1 ? (width - left - 54) / (visibleKeys.length - 1) : 0;
  const xFor = (key: string) => keys.length === 1
    ? left + (width - left - 54) / 2
    : left + Math.max(0, visibleKeys.findIndex(([item]) => item === key)) * step;
  const yFor = (value: number) => top + (value / 5) * plotHeight;

  return (
    <section className="surface overflow-hidden rounded-[1.2rem] px-3 py-2.5" aria-labelledby="beauty-tier-chart-title">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 ui-divider">
        <h2 id="beauty-tier-chart-title" className="text-lg text-[var(--foreground)]">颜值梯度变化</h2>
        <div className="flex flex-wrap gap-3 text-xs ui-subtle">{series.map((item, index) => <span key={item.editor.id} className="inline-flex items-center gap-1.5"><span className="h-2 w-5 rounded-full" style={{ backgroundColor: SERIES_COLORS[index] }} />{item.editor.name}</span>)}</div>
      </div>
      <div className="mt-1 overflow-hidden" data-testid="beauty-tier-chart">
        <svg className="block h-[9.5rem] w-full" viewBox={`0 0 ${width} 160`} preserveAspectRatio="none" role="img" aria-label="两位编辑人按日期和活动记录的颜值梯度曲线">
          {[0, 1, 2, 3, 4, 5].map((value) => { const y = yFor(value); return <g key={value}><line x1={left} x2={width - 32} y1={y} y2={y} stroke="var(--line-soft)" /><text x={left - 30} y={y + 4} fill="var(--foreground-soft)" fontSize="12">T{value}</text></g>; })}
          {series.map((item, seriesIndex) => { const points = item.points.filter((point) => visibleKeys.some(([key]) => key === `${point.date}:${point.eventName}`)).map((point) => ({ ...point, x: xFor(`${point.date}:${point.eventName}`), y: yFor(point.beautyTier) })); return <g key={item.editor.id}>{points.length > 1 ? <polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={SERIES_COLORS[seriesIndex]} strokeWidth="3" strokeLinejoin="round" /> : null}{points.map((point) => <circle key={point.id} cx={point.x} cy={point.y} r="6" fill={SERIES_COLORS[seriesIndex]} stroke="var(--surface)" strokeWidth="3" tabIndex={0}><title>{`${point.date.slice(0, 10)} · ${point.eventName} · ${item.editor.name} T${point.beautyTier}`}</title></circle>)}</g>; })}
          {visibleKeys.map(([key, point]) => { const x = xFor(key); const label = point.eventName.length > 6 ? `${point.eventName.slice(0, 6)}…` : point.eventName; return <g key={key} transform={`translate(${x},${top + plotHeight + 18})`}><text textAnchor="middle" fill="var(--foreground-soft)" fontSize="8">{point.date.slice(5, 10)}</text><text y="12" textAnchor="middle" fill="var(--foreground)" fontSize="8"><title>{point.eventName}</title>{label}</text></g>; })}
        </svg>
      </div>
    </section>
  );
}
