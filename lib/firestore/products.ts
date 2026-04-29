import {
  addDoc,
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
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "@/lib/firestore/client";
import { db } from "@/lib/firebase";
import type { ItemCodes } from "@/types/product";

const COLLECTION = "products";
const DEFAULT_PAGE_SIZE = 25;

export type ProductRecord = Record<string, unknown> & { id: string };

export type ProductListItem = ProductRecord & {
  name: string;
  price: number | null;
  thumbnail: string;
  itemDescription: string;
  itemCode: string;
  itemCodes: ItemCodes | undefined;
  ecoItemCode: string;
  litItemCode: string;
  brand: string | string[] | undefined;
  brands: string[] | undefined;
  website: string | string[] | undefined;
  websites: string[] | undefined;
  categories: string;
  productFamily: string;
  productClass: string;
  productUsage: string[] | string | undefined;
  mainImage: string;
  tdsFileUrl: string;
  rawImage: string[] | string;
  createdAt: unknown;
};

export type ProductsCursor = QueryDocumentSnapshot<DocumentData> | null;

export type ProductsPage = {
  items: ProductListItem[];
  cursor: ProductsCursor;
  hasMore: boolean;
};

export type ProductsPageParams = {
  pageSize?: number;
  cursor?: ProductsCursor;
  website?: string;
  brand?: string;
  searchTerm?: string;
  productUsage?: string;
  productFamily?: string;
  productClass?: string;
  createdAfter?: Date;
};

function toListItem(id: string, data: Record<string, unknown>): ProductListItem {
  const name = String((data.name ?? data.itemDescription ?? "") as string);
  const price =
    typeof data.salePrice === "number"
      ? data.salePrice
      : typeof data.regularPrice === "number"
        ? data.regularPrice
        : null;
  const thumbnail = String((data.mainImage ?? "") as string);
  return {
    id,
    name,
    price,
    thumbnail,
    itemDescription: String((data.itemDescription ?? "") as string),
    itemCode: String((data.itemCode ?? "") as string),
    itemCodes: data.itemCodes as ItemCodes | undefined,
    ecoItemCode: String((data.ecoItemCode ?? "") as string),
    litItemCode: String((data.litItemCode ?? "") as string),
    brand: data.brand as string | string[] | undefined,
    brands: data.brands as string[] | undefined,
    website: data.website as string | string[] | undefined,
    websites: data.websites as string[] | undefined,
    categories: String((data.categories ?? "") as string),
    productFamily: String((data.productFamily ?? "") as string),
    productClass: String((data.productClass ?? "") as string),
    productUsage: data.productUsage as string[] | string | undefined,
    mainImage: String((data.mainImage ?? "") as string),
    tdsFileUrl: String((data.tdsFileUrl ?? "") as string),
    rawImage: (data.rawImage as string[] | string | undefined) ?? [],
    createdAt: data.createdAt,
  };
}

export async function fetchProductsPage(
  cursor?: ProductsCursor,
  params?: Omit<ProductsPageParams, "cursor">,
): Promise<ProductsPage> {
  const pageSize = Math.min(Math.max(params?.pageSize ?? DEFAULT_PAGE_SIZE, 10), 50);
  const searchTerm = (params?.searchTerm ?? "").trim();
  const constraints: any[] = [];

  if (params?.website) {
    constraints.push(where("websites", "array-contains", params.website));
  }
  if (params?.brand) {
    constraints.push(where("brands", "array-contains", params.brand));
  }
  if (params?.productUsage) {
    constraints.push(where("productUsage", "array-contains", params.productUsage));
  }
  if (params?.productFamily) {
    constraints.push(where("productFamily", "==", params.productFamily));
  }
  if (params?.productClass) {
    constraints.push(where("productClass", "==", params.productClass));
  }
  if (searchTerm) {
    constraints.push(orderBy("name", "asc"));
    constraints.push(startAt(searchTerm));
    constraints.push(endAt(`${searchTerm}\uf8ff`));
  } else {
    if (params?.createdAfter) {
      constraints.push(where("createdAt", ">=", params.createdAfter));
    }
    constraints.push(orderBy("createdAt", "desc"));
  }
  if (cursor) {
    constraints.push(startAfter(cursor));
  }
  constraints.push(limit(pageSize + 1));

  const snap = await getDocs(query(collection(db, COLLECTION), ...constraints));
  const pageDocs = snap.docs.slice(0, pageSize);

  return {
    items: pageDocs.map((d) => toListItem(d.id, d.data() as Record<string, unknown>)),
    cursor: pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null,
    hasMore: snap.docs.length > pageSize,
  };
}

export async function fetchProductById(id: string): Promise<ProductRecord | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
}

export async function searchProducts(term: string): Promise<ProductListItem[]> {
  const searchTerm = term.trim();
  if (!searchTerm) return [];
  const snap = await getDocs(
    query(
      collection(db, COLLECTION),
      orderBy("name", "asc"),
      startAt(searchTerm),
      endAt(`${searchTerm}\uf8ff`),
      limit(20),
    ),
  );
  return snap.docs.map((d) => toListItem(d.id, d.data() as Record<string, unknown>));
}

export async function createProduct(data: Record<string, unknown>): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), data);
  return ref.id;
}

export async function updateProduct(
  id: string,
  data: Partial<Record<string, unknown>>,
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), data as never);
}

export async function deleteProduct(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
