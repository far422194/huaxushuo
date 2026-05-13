// 耗时格式化：< 60s 显示 "Xs"；< 1h 显示 "M 分 Ss"；> 1h 显示 "H 时 Mm"
// 用于"生成耗时"展示。0/undefined 返回空串
export function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return "";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec === 0 ? `${min}m` : `${min}m${sec}s`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

