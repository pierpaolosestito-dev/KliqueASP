export interface NumericTemporalInterval {
  start: number;
  end: number;
}

export function isTimelineControlAvailable(
  featureEnabled: boolean,
  hasMappedNodeTimeline: boolean,
  edgeIntervalsAvailable: boolean
): boolean {
  return featureEnabled && (hasMappedNodeTimeline || edgeIntervalsAvailable);
}

/** Keeps an edge when its closed validity interval intersects the query window. */
export function filterLinksByTemporalWindow<Link>(
  links: readonly Link[],
  getInterval: (link: Link) => NumericTemporalInterval | null,
  windowStart: number,
  windowEnd: number
): Link[] {
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowStart > windowEnd) {
    return [...links];
  }

  return links.filter((link) => {
    const interval = getInterval(link);
    if (!interval || !Number.isFinite(interval.start) || !Number.isFinite(interval.end) || interval.start > interval.end) {
      return true;
    }
    return interval.start <= windowEnd && interval.end >= windowStart;
  });
}
