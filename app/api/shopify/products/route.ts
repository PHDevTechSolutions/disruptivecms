import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  // ── Read env vars INSIDE the handler, not at module level ──────────────────
  // Reading at module level in Next.js App Router can evaluate before the
  // runtime environment is fully injected, causing false "missing" errors.
  // Support both naming conventions (e.g. .env.local: SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN).
  const SHOPIFY_STORE_DOMAIN =
    process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN ??
    process.env.SHOPIFY_STORE_DOMAIN ??
    "";
  const SHOPIFY_ADMIN_ACCESS_TOKEN =
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ??
    process.env.SHOPIFY_ACCESS_TOKEN ??
    "";

  if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
    return NextResponse.json(
      {
        error:
          "Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN in environment variables.",
      },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);

  // ── Fix: bulk-uploader sends ?mode=draft|public, not ?status= ──────────────
  // Map our internal "mode" to Shopify's "status" query param:
  //   mode "draft"  → Shopify status "draft"   (also catches archived separately)
  //   mode "public" → Shopify status "active"
  const mode = searchParams.get("mode") ?? "draft";
  const shopifyStatus = mode === "public" ? "active" : "draft";

  const products: unknown[] = [];

  // Shopify REST paginates via Link headers — walk all pages
  let nextUrl: string | null =
    `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/products.json` +
    `?limit=250&status=${shopifyStatus}&fields=id,title,handle,body_html,vendor,product_type,status,tags,variants,options,images`;

  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json(
        {
          error: `Shopify responded with ${res.status}: ${body.slice(0, 500)}`,
        },
        { status: res.status },
      );
    }

    const data = (await res.json()) as { products?: unknown[] };
    products.push(...(data.products ?? []));

    // Follow cursor-based pagination
    const linkHeader: string = res.headers.get("Link") ?? "";
    const nextMatch: RegExpMatchArray | null = linkHeader.match(
      /<([^>]+)>;\s*rel="next"/,
    );
    nextUrl = nextMatch ? nextMatch[1] : null;
  }

  // If mode=draft, also fetch archived products and merge them in
  // (Shopify treats "draft" and "archived" as separate statuses)
  if (mode === "draft") {
    let archivedUrl: string | null =
      `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/products.json` +
      `?limit=250&status=archived&fields=id,title,handle,body_html,vendor,product_type,status,tags,variants,options,images`;

    while (archivedUrl) {
      const res = await fetch(archivedUrl, {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ADMIN_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (res.ok) {
        const data = (await res.json()) as { products?: unknown[] };
        products.push(...(data.products ?? []));
        const linkHeader: string = res.headers.get("Link") ?? "";
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        archivedUrl = nextMatch ? nextMatch[1] : null;
      } else {
        // Non-fatal — archived fetch failed, continue with draft results
        console.warn("[shopify/products] Archived fetch failed:", res.status);
        archivedUrl = null;
      }
    }
  }

  return NextResponse.json({ products, total: products.length });
}