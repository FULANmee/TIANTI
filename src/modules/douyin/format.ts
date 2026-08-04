export function formatDouyinFollowerCount(count: number) {
  const precision = count >= 10_000 ? 1 : count >= 1_000 ? 2 : count >= 100 ? 3 : 4;
  return `${Number((count / 10_000).toFixed(precision))} 万`;
}
