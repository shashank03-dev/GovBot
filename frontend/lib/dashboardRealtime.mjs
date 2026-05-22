export function mergeRealtimeActivity(existingActivities, nextActivity, limit = 20) {
  if (!nextActivity?.event || !nextActivity?.timestamp) {
    return existingActivities;
  }

  const deduped = new Map();

  for (const activity of [...existingActivities, nextActivity]) {
    if (!activity?.event || !activity?.timestamp) {
      continue;
    }

    deduped.set(`${activity.timestamp}::${activity.event}`, activity);
  }

  return Array.from(deduped.values())
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
    .slice(-limit);
}
