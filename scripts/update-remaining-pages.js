#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  '/vercel/share/v0-project/app/content/faq-manager/page.tsx',
  '/vercel/share/v0-project/app/content/popup/page.tsx',
  '/vercel/share/v0-project/app/content/projects/page.tsx',
  '/vercel/share/v0-project/app/jobs/applications/page.tsx',
  '/vercel/share/v0-project/app/jobs/careers/page.tsx',
];

function updateFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;

    // Add MainLayout import if not present
    if (!content.includes('MainLayout')) {
      const importLineRegex = /import.*from "@\/components\/ui\/tooltip";/;
      const match = content.match(importLineRegex);
      if (match) {
        content = content.replace(
          match[0],
          `import { MainLayout } from "@/components/layouts/MainLayout";\n${match[0]}`
        );
      }
    }

    // Remove sidebar imports
    content = content.replace(
      /import\s*\{\s*(SidebarInset,\s*)?(SidebarProvider,\s*)?(SidebarTrigger,\s*)*\s*\}\s*from\s*"@\/components\/ui\/sidebar";\n?/g,
      ''
    );
    
    // Remove AppSidebar import
    content = content.replace(
      /import\s*\{\s*AppSidebar\s*\}\s*from\s*"@\/components\/sidebar\/app-sidebar";\n?/g,
      ''
    );

    // Replace the layout structure - opening
    content = content.replace(
      /<TooltipProvider\s+delayDuration=\{0\}>\s*<SidebarProvider>\s*<AppSidebar\s*\/>\s*<SidebarInset/g,
      `<TooltipProvider delayDuration={0}>\n      <MainLayout`
    );

    // Remove SidebarTrigger
    content = content.replace(
      /<SidebarTrigger\s+className="[^"]*"\s*\/>\s*/g,
      ''
    );

    // Fix header - remove the trigger and adjust spacing
    content = content.replace(
      /header\s+className="flex\s+h-16\s+shrink-0\s+items-center\s+gap-2[^"]*"[^>]*>\s*<div\s+className="flex\s+items-center\s+gap-2\s+px-4[^"]*">\s*<Separator/,
      `header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">\n        <Separator`
    );

    // Also try simpler header fix
    content = content.replace(
      /header\s+className="flex\s+h-16\s+shrink-0\s+items-center[^"]*"[^>]*>\s*<SidebarTrigger/g,
      `header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">`
    );

    // Replace closing tags
    content = content.replace(
      /<\/SidebarInset>\s*<\/SidebarProvider>/g,
      `</MainLayout>`
    );

    if (content === originalContent) {
      console.log(`⚠️  ${path.basename(filePath)}: No changes (may already be updated)`);
      return false;
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`✅ ${path.basename(filePath)}: Updated`);
    return true;

  } catch (error) {
    console.error(`❌ ${path.basename(filePath)}: ${error.message}`);
    return false;
  }
}

console.log('🚀 Updating remaining pages...\n');
let successCount = 0;

filesToUpdate.forEach(filePath => {
  if (updateFile(filePath)) {
    successCount++;
  }
});

console.log(`\n✅ Updated: ${successCount}/${filesToUpdate.length}`);
