import {
  collection,
  deleteDoc,
  doc,
  endAt,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  startAt,
  type CollectionReference,
  type DocumentData,
  type DocumentSnapshot,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type WhereFilterOp,
  where,
  addDoc,
  updateDoc,
} from "@/lib/firestore/client";
import { db } from "@/lib/firebase";

export const DEFAULT_PAGE_SIZE = 25;

type BaseRecord = Record<string, unknown>;

export type PageCursor = QueryDocumentSnapshot<DocumentData> | null;

export type PageResult<T> = {
  items: T[];
  cursor: PageCursor;
  hasMore: boolean;
};

export type FetchPageOptions = {
  pageSize?: number;
  cursor?: PageCursor;
  orderField?: string;
  orderDirection?: "asc" | "desc";
  filters?: Array<{
    field: string;
    op: WhereFilterOp;
    value: unknown;
  }>;
};

function toRecord<T extends BaseRecord>(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): T & { id: string } {
  return { id: snapshot.id, ...(snapshot.data() as T) };
}

function buildConstraints(options?: FetchPageOptions): QueryConstraint[] {
  const pageSize = Math.min(Math.max(options?.pageSize ?? DEFAULT_PAGE_SIZE, 10), 50);
  const orderField = options?.orderField ?? "createdAt";
  const orderDirection = options?.orderDirection ?? "desc";
  const constraints: QueryConstraint[] = [];

  for (const filter of options?.filters ?? []) {
    constraints.push(where(filter.field, filter.op, filter.value));
  }

  constraints.push(orderBy(orderField, orderDirection));

  if (options?.cursor) {
    constraints.push(startAfter(options.cursor));
  }

  constraints.push(limit(pageSize + 1));
  return constraints;
}

export async function fetchPage<T extends BaseRecord>(
  collectionName: string,
  options?: FetchPageOptions,
): Promise<PageResult<T & { id: string }>> {
  const ref = collection(db, collectionName);
  const snap = await getDocs(query(ref, ...buildConstraints(options)));
  const docs = snap.docs;
  const pageSize = Math.min(Math.max(options?.pageSize ?? DEFAULT_PAGE_SIZE, 10), 50);
  const pageDocs = docs.slice(0, pageSize);

  return {
    items: pageDocs.map((d) => toRecord<T>(d)),
    cursor: pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null,
    hasMore: docs.length > pageSize,
  };
}

export async function fetchById<T extends BaseRecord>(
  collectionName: string,
  id: string,
): Promise<(T & { id: string }) | null> {
  const ref = doc(db, collectionName, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as T) };
}

export async function create<T extends BaseRecord>(
  collectionName: string,
  payload: T,
): Promise<string> {
  const ref = await addDoc(collection(db, collectionName), payload);
  return ref.id;
}

export async function update<T extends BaseRecord>(
  collectionName: string,
  id: string,
  payload: Partial<T>,
): Promise<void> {
  await updateDoc(doc(db, collectionName, id), payload as never);
}

export async function remove(collectionName: string, id: string): Promise<void> {
  await deleteDoc(doc(db, collectionName, id));
}

export type SearchOptions = {
  pageSize?: number;
  orderField?: string;
};

export async function searchPrefix<T extends BaseRecord>(
  collectionName: string,
  field: string,
  term: string,
  options?: SearchOptions,
): Promise<(T & { id: string })[]> {
  const normalized = term.trim();
  if (!normalized) return [];

  const pageSize = Math.min(Math.max(options?.pageSize ?? 10, 10), 20);
  const orderField = options?.orderField ?? field;
  const ref = collection(db, collectionName);
  const snap = await getDocs(
    query(
      ref,
      orderBy(orderField, "asc"),
      startAt(normalized),
      endAt(`${normalized}\uf8ff`),
      limit(pageSize),
    ),
  );
  return snap.docs.map((d) => toRecord<T>(d));
}

export function toCursor(snapshot: DocumentSnapshot<DocumentData> | null): PageCursor {
  if (!snapshot) return null;
  if ("id" in snapshot && "data" in snapshot && "exists" in snapshot) {
    if (snapshot.exists()) return snapshot as QueryDocumentSnapshot<DocumentData>;
  }
  return null;
}

export type CollectionRef = CollectionReference<DocumentData>;
