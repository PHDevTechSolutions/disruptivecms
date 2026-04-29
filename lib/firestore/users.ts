import {
  create,
  fetchById,
  fetchPage,
  remove,
  searchPrefix,
  update,
  type FetchPageOptions,
} from "@/lib/firestore/core";

const COLLECTION = "users";

export type UserRecord = Record<string, unknown> & { id: string };

export function fetchUsersPage(options?: FetchPageOptions) {
  return fetchPage<UserRecord>(COLLECTION, {
    orderField: options?.orderField ?? "createdAt",
    orderDirection: options?.orderDirection ?? "desc",
    pageSize: options?.pageSize,
    cursor: options?.cursor,
    filters: options?.filters,
  });
}

export function fetchUserById(id: string) {
  return fetchById<UserRecord>(COLLECTION, id);
}

export function searchUsers(term: string, pageSize = 10) {
  return searchPrefix<UserRecord>(COLLECTION, "email", term.toLowerCase(), {
    pageSize,
    orderField: "email",
  });
}

export function createUser(payload: Record<string, unknown>) {
  return create(COLLECTION, payload);
}

export function updateUser(id: string, payload: Partial<Record<string, unknown>>) {
  return update(COLLECTION, id, payload);
}

export function deleteUser(id: string) {
  return remove(COLLECTION, id);
}

