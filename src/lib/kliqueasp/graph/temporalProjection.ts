export interface NumericTemporalInterval {
  start: number;
  end: number;
}

/** Resolves an optional startup selection while keeping the full timeline bounds navigable. */
export function resolveInitialTemporalWindow(
  bounds: NumericTemporalInterval,
  configuredWindow: unknown
): NumericTemporalInterval {
  if (configuredWindow === null || typeof configuredWindow !== "object" || Array.isArray(configuredWindow)) {
    return { ...bounds };
  }
  const candidate = configuredWindow as Record<string, unknown>;
  const start = candidate.start;
  const end = candidate.end;
  if (typeof bounds.start !== "number" || !Number.isFinite(bounds.start) ||
    typeof bounds.end !== "number" || !Number.isFinite(bounds.end) || bounds.start > bounds.end ||
    typeof start !== "number" || !Number.isFinite(start) ||
    typeof end !== "number" || !Number.isFinite(end) || start > end ||
    start < bounds.start || end > bounds.end) {
    return { ...bounds };
  }
  return { start, end };
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
