import type { TalentDetail } from "@/modules/domain/types";

const SERIES_COLORS = ["#2b6df6", "#b13b45"];

export function BeautyTierChart({ series }: { series: TalentDetail["beautyTierSeries"] }) {
  const keys = [...new Map(series.flatMap((item) => item.points).map((point) => [`${point.date}:${point.eventName}`, point])).entries()]
    .sort(([, left], [, right]) => left.date.localeCompare(right.date) || left.eventName.localeCompare(right.eventName, "zh-CN"));
  if (!keys.length) return null;
  const width = Math.max(720, keys.length * 116 + 120);
  const left = 58;
  const top = 26;
  const plotHeight = 220;
  const step = keys.length > 1 ? (width - left - 54) / (keys.length - 1) : 0;
  const xFor = (key: string) => keys.length === 1
    ? left + (width - left - 54) / 2
    : left + Math.max(0, keys.findIndex(([item]) => item === key)) * step;
  const yFor = (value: number) => top + plotHeight - (value / 5) * plotHeight;

  return (
    <section className="surface overflow-hidden rounded-[2rem] p-6 md:p-7" aria-labelledby="beauty-tier-chart-title">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-4 ui-divider">
        <div><p className="ui-kicker">现场测绘</p><h2 id="beauty-tier-chart-title" className="mt-3 text-3xl tracking-[-0.03em] text-[var(--foreground)]">颜值梯度变化</h2></div>
        <div className="flex flex-wrap gap-4 text-sm ui-subtle">{series.map((item, index) => <span key={item.editor.id} className="inline-flex items-center gap-2"><span className="h-2.5 w-7 rounded-full" style={{ backgroundColor: SERIES_COLORS[index] }} />{item.editor.name}</span>)}</div>
      </div>
      <div className="mt-5 overflow-x-auto pb-2" data-testid="beauty-tier-chart">
        <svg width={width} height={330} role="img" aria-label="两位编辑人按日期和活动记录的颜值梯度曲线">
          {[0, 1, 2, 3, 4, 5].map((value) => { const y = yFor(value); return <g key={value}><line x1={left} x2={width - 32} y1={y} y2={y} stroke="var(--line-soft)" /><text x={left - 22} y={y + 4} fill="var(--foreground-soft)" fontSize="12">{value}</text></g>; })}
          {series.map((item, seriesIndex) => { const points = item.points.map((point) => ({ ...point, x: xFor(`${point.date}:${point.eventName}`), y: yFor(point.beautyTier) })); return <g key={item.editor.id}>{points.length > 1 ? <polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={SERIES_COLORS[seriesIndex]} strokeWidth="3" strokeLinejoin="round" /> : null}{points.map((point) => <circle key={point.id} cx={point.x} cy={point.y} r="6" fill={SERIES_COLORS[seriesIndex]} stroke="var(--surface)" strokeWidth="3" tabIndex={0}><title>{`${point.date.slice(0, 10)} · ${point.eventName} · ${item.editor.name} ${point.beautyTier}`}</title></circle>)}</g>; })}
          {keys.map(([key, point]) => { const x = xFor(key); const label = point.eventName.length > 8 ? `${point.eventName.slice(0, 8)}…` : point.eventName; return <g key={key} transform={`translate(${x},${top + plotHeight + 24})`}><text textAnchor="middle" fill="var(--foreground-soft)" fontSize="11">{point.date.slice(5, 10)}</text><text y="18" textAnchor="middle" fill="var(--foreground)" fontSize="12"><title>{point.eventName}</title>{label}</text></g>; })}
        </svg>
      </div>
    </section>
  );
}
