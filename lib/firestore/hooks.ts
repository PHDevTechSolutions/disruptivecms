"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCmsPage, type CmsCollection } from "@/lib/firestore/cms";
import { fetchOrdersPage } from "@/lib/firestore/orders";
import { fetchProductsPage } from "@/lib/firestore/products";
import { fetchUsersPage } from "@/lib/firestore/users";
import { type FetchPageOptions } from "@/lib/firestore/core";

export function useProductsPageQuery(options?: FetchPageOptions) {
  return useQuery({
    queryKey: ["firestore", "products", options],
    queryFn: () =>
      fetchProductsPage(null, {
        pageSize: options?.pageSize,
        searchTerm: undefined,
      }),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useUsersPageQuery(options?: FetchPageOptions) {
  return useQuery({
    queryKey: ["firestore", "users", options],
    queryFn: () => fetchUsersPage(options),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useOrdersPageQuery(options?: FetchPageOptions) {
  return useQuery({
    queryKey: ["firestore", "orders", options],
    queryFn: () => fetchOrdersPage(options),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useCmsPageQuery(
  collectionName: CmsCollection,
  options?: FetchPageOptions,
) {
  return useQuery({
    queryKey: ["firestore", "cms", collectionName, options],
    queryFn: () => fetchCmsPage(collectionName, options),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
