#!/usr/bin/env node

/**
 * Script to batch update product pages to use MainLayout instead of Sidebar
 * This script handles the common pattern across all product pages
 */

const fs = require('fs');
const path = require('path');

const productPages = [
  '/vercel/share/v0-project/app/products/applications/page.tsx',
  '/vercel/share/v0-project/app/products/brands/page.tsx',
  '/vercel/share/v0-project/app/products/orders/page.tsx',
  '/vercel/share/v0-project/app/products/product-families/page.tsx',
  '/vercel/share/v0-project/app/products/requests/page.tsx',
  '/vercel/share/v0-project/app/products/reviews/page.tsx',
  '/vercel/share/v0-project/app/products/series/page.tsx',
  '/vercel/share/v0-project/app/products/shopify-products/page.tsx',
  '/vercel/share/v0-project/app/products/solutions/page.tsx',
  '/vercel/share/v0-project/app/products/specs/page.tsx',
  '/vercel/share/v0-project/app/products/taskflow-products/page.tsx',
];

function updateFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;

    // 1. Add MainLayout import if not present
    if (!content.includes('MainLayout')) {
      const importRegex = /import \{ ([\s\S]*?) \} from "@\/components\/sidebar\/app-sidebar";/;
      content = content.replace(
        /import { AppSidebar } from "@\/components\/sidebar\/app-sidebar";/,
        `import { MainLayout } from "@/components/layouts/MainLayout";\nimport { AppSidebar } from "@/components/sidebar/app-sidebar";`
      );
    }

    // 2. Remove SidebarInset, SidebarProvider, SidebarTrigger from sidebar imports
    content = content.replace(
      /import \{\s*(SidebarInset,\s*)?(SidebarProvider,\s*)?(SidebarTrigger,\s*)*\s*\} from "@\/components\/ui\/sidebar";/,
      ''
    );

    // Remove completely empty sidebar import line
    content = content.replace(/\nimport \{\s*\} from "@\/components\/ui\/sidebar";\n/g, '\n');

    // 3. Replace the layout structure - only the main return statement
    // Find and replace <SidebarProvider> opening with <MainLayout>
    const sidebarProviderOpen = /<SidebarProvider>\s*<AppSidebar \/>\s*<SidebarInset>/;
    const mainLayoutOpen = `<MainLayout>`;
    content = content.replace(sidebarProviderOpen, mainLayoutOpen);

    // 4. Remove <SidebarTrigger> button
    content = content.replace(
      /<SidebarTrigger[^>]*className="[^"]*" \/>/g,
      ''
    );

    // 5. Adjust header spacing - remove the SidebarTrigger and adjust spacing
    content = content.replace(
      /header className="flex h-16 shrink-0 items-center gap-2[^"]*" \*>\s*<div className="flex items-center gap-2 px-4">\s*<SidebarTrigger[^>]*\/>\s*<Separator orientation="vertical" className="mr-2[^"]*" \/>/,
      `header className="flex h-16 shrink-0 items-center gap-2 px-4 border-b border-border">
              <Separator orientation="vertical" className="mr-2 h-4" />`
    );

    // Simpler header fix - just remove SidebarTrigger and fix spacing
    content = content.replace(
      /<SidebarTrigger className="-ml-1" \/>\s*<Separator/,
      `<Separator`
    );

    // 6. Remove closing </SidebarInset></SidebarProvider> and replace with </MainLayout>
    content = content.replace(
      /<\/SidebarInset>\s*<\/SidebarProvider>/g,
      `</MainLayout>`
    );

    // Check if content actually changed
    if (content === originalContent) {
      console.log(`⚠️  ${path.basename(filePath)}: No changes made (may already be updated)`);
      return false;
    }

    // Write back
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`✅ ${path.basename(filePath)}: Updated successfully`);
    return true;

  } catch (error) {
    console.error(`❌ ${path.basename(filePath)}: Error - ${error.message}`);
    return false;
  }
}

// Main execution
console.log('🚀 Starting batch update of product pages...\n');

let successCount = 0;
let failureCount = 0;

productPages.forEach(filePath => {
  if (fs.existsSync(filePath)) {
    if (updateFile(filePath)) {
      successCount++;
    } else {
      failureCount++;
    }
  } else {
    console.log(`⚠️  File not found: ${filePath}`);
    failureCount++;
  }
});

console.log(`\n✅ Updated: ${successCount}/${productPages.length}`);
if (failureCount > 0) {
  console.log(`⚠️  Failed/Skipped: ${failureCount}/${productPages.length}`);
}
