export function formatDouyinFollowerCount(count: number) {
  return `${(count / 10_000).toFixed(1)}万`;
}

export function formatDouyinFollowerDelta(delta: number) {
  return `${delta >= 0 ? "+" : "-"}${(Math.abs(delta) / 10_000).toFixed(1)}万`;
}
