import {
  create,
  fetchById,
  fetchPage,
  remove,
  searchPrefix,
  update,
  type FetchPageOptions,
} from "@/lib/firestore/core";

export type CmsCollection =
  | "blogs"
  | "catalogs"
  | "company"
  | "faq_settings"
  | "home_popups"
  | "projects"
  | "applications"
  | "brand_name"
  | "series"
  | "solutions"
  | "specs"
  | "specItems"
  | "productfamilies"
  | "requests"
  | "cms_audit_logs";

export type CmsRecord = Record<string, unknown> & { id: string };

export function fetchCmsPage(collectionName: CmsCollection, options?: FetchPageOptions) {
  return fetchPage<CmsRecord>(collectionName, options);
}

export function fetchCmsById(collectionName: CmsCollection, id: string) {
  return fetchById<CmsRecord>(collectionName, id);
}

export function searchCms(
  collectionName: CmsCollection,
  field: string,
  term: string,
  pageSize = 10,
) {
  return searchPrefix<CmsRecord>(collectionName, field, term, { pageSize, orderField: field });
}

export function createCms(collectionName: CmsCollection, payload: Record<string, unknown>) {
  return create(collectionName, payload);
}

export function updateCms(
  collectionName: CmsCollection,
  id: string,
  payload: Partial<Record<string, unknown>>,
) {
  return update(collectionName, id, payload);
}

export function deleteCms(collectionName: CmsCollection, id: string) {
  return remove(collectionName, id);
}

