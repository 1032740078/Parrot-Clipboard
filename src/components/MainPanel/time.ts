export const formatRelativeTime = (createdAt: number, now = Date.now()): string => {
  const diffSeconds = Math.max(0, Math.floor((now - createdAt) / 1000));

  if (diffSeconds < 60) {
    return "刚刚";
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} 小时前`;
  }

  if (diffHours < 48) {
    return "昨天";
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} 天前`;
};
