import {
  create,
  fetchById,
  fetchPage,
  remove,
  searchPrefix,
  update,
  type FetchPageOptions,
} from "@/lib/firestore/core";

const COLLECTION = "inquiries";

export type OrderRecord = Record<string, unknown> & { id: string };

export function fetchOrdersPage(options?: FetchPageOptions) {
  return fetchPage<OrderRecord>(COLLECTION, {
    orderField: options?.orderField ?? "createdAt",
    orderDirection: options?.orderDirection ?? "desc",
    pageSize: options?.pageSize,
    cursor: options?.cursor,
    filters: options?.filters,
  });
}

export function fetchOrderById(id: string) {
  return fetchById<OrderRecord>(COLLECTION, id);
}

export function searchOrders(term: string, pageSize = 10) {
  return searchPrefix<OrderRecord>(COLLECTION, "name", term, {
    pageSize,
    orderField: "name",
  });
}

export function createOrder(payload: Record<string, unknown>) {
  return create(COLLECTION, payload);
}

export function updateOrder(id: string, payload: Partial<Record<string, unknown>>) {
  return update(COLLECTION, id, payload);
}

export function deleteOrder(id: string) {
  return remove(COLLECTION, id);
}

