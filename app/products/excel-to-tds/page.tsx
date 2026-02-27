'use client';

import { ExcelTdsGenerator } from '@/components/product-forms/excel-tds-generator';
import { Metadata } from 'next';

export default function ExcelToTdsPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-balance mb-2">
            EXCEL TO TDS CONVERTER
          </h1>
          <p className="text-foreground/70 text-lg">
            Transform your Excel product catalogs into professional Technical Data Sheet PDFs and import them directly to your database.
          </p>
        </div>

        {/* Main Content */}
        <div className="max-w-6xl">
          <ExcelTdsGenerator />
        </div>

        {/* Help Section */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="border rounded-lg p-6 bg-foreground/5">
            <h3 className="font-bold uppercase mb-2 text-sm">SUPPORTED FORMATS</h3>
            <p className="text-xs text-foreground/70">
              Excel files (.xlsx, .xls) with product data in columns A-Y
            </p>
          </div>
          <div className="border rounded-lg p-6 bg-foreground/5">
            <h3 className="font-bold uppercase mb-2 text-sm">AUTOMATIC MAPPING</h3>
            <p className="text-xs text-foreground/70">
              Sheet titles map to product families. Product names, codes, and specs automatically extracted.
            </p>
          </div>
          <div className="border rounded-lg p-6 bg-foreground/5">
            <h3 className="font-bold uppercase mb-2 text-sm">DATABASE IMPORT</h3>
            <p className="text-xs text-foreground/70">
              Save generated products directly to your database with duplicate detection.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
