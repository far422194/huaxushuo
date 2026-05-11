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

// 相对时间格式化：超过 7 天显示完整日期，否则显示 "刚刚 / N 分钟前 / N 小时前 / N 天前"
export function relativeTime(ts: number): string {
  if (!ts || ts <= 0) return "";
  const diff = Date.now() - ts;
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  return new Date(ts).toLocaleDateString("zh-CN");
}
