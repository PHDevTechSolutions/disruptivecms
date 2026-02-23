import admin from "firebase-admin";
import serviceAccount from "@/lib/firebase/admin";

// Initialize admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  });
}

export const adminDb = admin.firestore();

// ------------------
// Migration Script
// ------------------

type ParsedSpec = {
  name: string;
  value: string;
};

const SKIP_REGEX = /SPECIFICATION/i;

// Normalize labels for consistency
function normalizeLabel(label: string) {
  return label.trim().toUpperCase();
}

// ------------------
// Parse specs
// ------------------
function parseSpecs(text: string): ParsedSpec[] {
  const specs: ParsedSpec[] = [];
  const t = text.toUpperCase();

  // WATTAGE
  const wattageMatch = t.match(/\b(\d+\s?W(?:\s*,\s*\d+\s?W)*)\b/);
  if (wattageMatch) specs.push({ name: "WATTAGE", value: wattageMatch[1] });

  // LIGHT SOURCE
  if (t.includes("LED COB"))
    specs.push({ name: "LIGHT SOURCE", value: "LED COB" });
  else if (t.includes("LED"))
    specs.push({ name: "LIGHT SOURCE", value: "LED" });

  // COLOR TEMPERATURE
  const tempMatch = t.match(/(\d{4}K\s*-\s*\d{4}K|\d{4}K|DAYLIGHT)/);
  if (tempMatch) specs.push({ name: "COLOR TEMPERATURE", value: tempMatch[1] });

  // BEAM ANGLE
  const angleMatch = t.match(/(\d+\s?(DEGREE|DEGREES|°))/);
  if (angleMatch) specs.push({ name: "BEAM ANGLE", value: angleMatch[1] });

  // MATERIAL
  if (t.includes("ALUMINUM"))
    specs.push({ name: "MATERIAL", value: "ALUMINUM HOUSING + GLASS" });

  // WORKING VOLTAGE
  const voltageMatch = t.match(/AC\s*\d+\s*-\s*\d+V\s*\d+\/\d+HZ/);
  if (voltageMatch)
    specs.push({ name: "WORKING VOLTAGE", value: voltageMatch[0] });

  // MOUNTING
  if (t.includes("BRACKET"))
    specs.push({ name: "MOUNTING", value: "WITH BUILT-IN BRACKET" });

  return specs;
}

// ------------------
// Run migration
// ------------------
async function run() {
  console.log("🔍 Fetching shopify-importer products…");

  const productsSnap = await adminDb
    .collection("products")
    .where("importSource", "==", "shopify-importer")
    .get();

  console.log(`📦 Found ${productsSnap.size} products`);

  // Load grouped specs (to map label -> group)
  const specsSnap = await adminDb.collection("specs").get();
  const groupedLabels = new Set<string>();
  const labelToGroup = new Map<string, string>();

  specsSnap.forEach((doc) => {
    const data = doc.data();
    const groupName = data.name || "GENERAL SPECIFICATIONS";
    const items = data.items || [];

    items.forEach((i: any) => {
      if (i.label) {
        const normLabel = normalizeLabel(i.label);
        groupedLabels.add(normLabel);
        labelToGroup.set(normLabel, groupName);
      }
    });
  });

  // Load standalone specItems
  const specItemsSnap = await adminDb.collection("specItems").get();
  const standaloneLabels = new Set<string>();
  specItemsSnap.forEach((doc) => {
    const label = normalizeLabel(doc.data().label);
    standaloneLabels.add(label);
  });

  // ------------------
  // Process each product
  // ------------------
  for (const productDoc of productsSnap.docs) {
    const product = productDoc.data();
    const desc: string = product.shortDescription || "";

    if (!desc || SKIP_REGEX.test(desc)) continue;

    const parsedSpecs = parseSpecs(desc);
    if (parsedSpecs.length === 0) continue;

    // Add new standalone specItems
    for (const spec of parsedSpecs) {
      const label = normalizeLabel(spec.name);
      if (!groupedLabels.has(label) && !standaloneLabels.has(label)) {
        await adminDb.collection("specItems").add({
          label,
          createdAt: new Date(),
        });
        standaloneLabels.add(label);
        console.log(`➕ Added standalone spec: ${label}`);
      }
    }

    // Group specs by specGroup
    const specsByGroup: Record<string, ParsedSpec[]> = {};
    for (const spec of parsedSpecs) {
      const label = normalizeLabel(spec.name);
      const group = labelToGroup.get(label) || "GENERAL SPECIFICATIONS";

      if (!specsByGroup[group]) specsByGroup[group] = [];
      specsByGroup[group].push(spec);
    }

    // Build technicalSpecs array
    const technicalSpecs = Object.entries(specsByGroup).map(
      ([specGroup, specs]) => ({
        specGroup,
        specs: specs.map((s) => ({ name: s.name, value: s.value })),
      }),
    );

    // Update product
    await productDoc.ref.update({
      technicalSpecs,
      updatedAt: new Date(),
    });

    console.log(`✅ Updated: ${product.name}`);
  }

  console.log("🎉 Migration complete");
}

run().catch((err) => {
  console.error("❌ Migration failed");
  console.error(err);
  process.exit(1);
});
