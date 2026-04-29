import {
  getDocs as fbGetDocs,
  limit as fbLimit,
  onSnapshot as fbOnSnapshot,
  orderBy as fbOrderBy,
  query as fbQuery,
  type QueryConstraint,
} from "firebase/firestore";

export * from "firebase/firestore";

const DEFAULT_QUERY_LIMIT = 50;
const POLL_INTERVAL_MS = 60_000;

const REALTIME_COLLECTION_ALLOWLIST = new Set<string>([
  "products",
  "inventory",
  "cms_live_dashboards",
  "collaboration_sessions",
]);

function hasConstraintType(
  constraints: QueryConstraint[],
  types: ReadonlyArray<string>,
) {
  return constraints.some((constraint) =>
    types.includes((constraint as { type?: string }).type ?? ""),
  );
}

function enforceLimit(constraints: QueryConstraint[]) {
  if (hasConstraintType(constraints, ["limit", "limitToLast"])) {
    return constraints;
  }
  return [...constraints, fbLimit(DEFAULT_QUERY_LIMIT)];
}

function collectionIdFromQuery(target: unknown): string | null {
  const q = target as {
    _query?: { path?: { segments?: string[] } };
    _path?: { segments?: string[] };
  };
  const segments = q?._query?.path?.segments ?? q?._path?.segments ?? [];
  return segments.length > 0 ? segments[segments.length - 1] : null;
}

function canUseRealtime(target: unknown): boolean {
  const collectionId = collectionIdFromQuery(target);
  if (!collectionId) return false;
  return REALTIME_COLLECTION_ALLOWLIST.has(collectionId);
}

export const query = ((
  source: Parameters<typeof fbQuery>[0],
  ...constraints: QueryConstraint[]
) => {
  const limitedConstraints = enforceLimit(constraints);
  if (!hasConstraintType(limitedConstraints, ["orderBy"])) {
    limitedConstraints.push(fbOrderBy("__name__", "asc"));
  }
  return fbQuery(source, ...limitedConstraints);
}) as typeof fbQuery;

export const getDocs = ((
  source: Parameters<typeof fbGetDocs>[0],
) => {
  const maybeCollection = source as { id?: string };
  if (typeof maybeCollection?.id === "string") {
    return fbGetDocs(query(maybeCollection as never));
  }
  return fbGetDocs(source);
}) as typeof fbGetDocs;

export const onSnapshot = ((target: unknown, ...rest: unknown[]) => {
  if (canUseRealtime(target)) {
    return (fbOnSnapshot as (...args: unknown[]) => () => void)(target, ...rest);
  }

  let next: ((snapshot: unknown) => void) | null = null;
  let onError: ((error: unknown) => void) | null = null;

  if (typeof rest[0] === "function") {
    next = rest[0] as (snapshot: unknown) => void;
    if (typeof rest[1] === "function") {
      onError = rest[1] as (error: unknown) => void;
    }
  } else if (rest[0] && typeof rest[0] === "object" && "next" in (rest[0] as Record<string, unknown>)) {
    const observer = rest[0] as {
      next?: (snapshot: unknown) => void;
      error?: (error: unknown) => void;
    };
    next = observer.next ?? null;
    onError = observer.error ?? null;
  } else if (typeof rest[1] === "function") {
    next = rest[1] as (snapshot: unknown) => void;
    if (typeof rest[2] === "function") {
      onError = rest[2] as (error: unknown) => void;
    }
  }

  let stopped = false;
  const poll = async () => {
    if (stopped || !next) return;
    try {
      const snapshot = await getDocs(target as never);
      if (!stopped) next(snapshot);
    } catch (error) {
      if (!stopped && onError) onError(error);
    }
  };

  void poll();
  const interval = setInterval(poll, POLL_INTERVAL_MS);
  return () => {
    stopped = true;
    clearInterval(interval);
  };
}) as typeof fbOnSnapshot;
