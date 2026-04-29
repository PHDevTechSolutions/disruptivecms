"use client";

import * as React from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  fetchProductsPage,
  type ProductListItem,
  type ProductsCursor,
} from "@/lib/firestore/products";

type UseProductsParams = {
  pageSize?: number;
  website?: string;
  brand?: string;
  searchTerm?: string;
  productUsage?: string;
  productFamily?: string;
  productClass?: string;
  createdAfter?: Date;
};

export function useProducts(params: UseProductsParams) {
  const queryResult = useInfiniteQuery({
    queryKey: ["products", params],
    queryFn: ({ pageParam }) =>
      fetchProductsPage((pageParam as ProductsCursor | undefined) ?? null, params),
    initialPageParam: null as ProductsCursor,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.cursor : undefined),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const products = React.useMemo<ProductListItem[]>(
    () => queryResult.data?.pages.flatMap((page) => page.items) ?? [],
    [queryResult.data],
  );

  return {
    ...queryResult,
    products,
  };
}
