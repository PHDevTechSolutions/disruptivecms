/**
 * Image-to-placeholder matching utility for TDS PDFs.
 * Maps uploaded image files to their corresponding PDF placeholder fields
 * based on filename pattern matching.
 */

interface ImageFileWithUrl {
  name: string;
  url: string;
}

export interface ImageUrlsMap {
  main?: string;
  dimensionalDrawing?: string;
  mountingHeight?: string;
  driverCompatibility?: string;
  base?: string;
  illuminanceLevel?: string;
  wiringDiagram?: string;
  installation?: string;
  wiringLayout?: string;
  terminalLayout?: string;
  accessories?: string;
}

/**
 * Normalize a string for matching: lowercase, remove special chars, keep alphanumeric only
 */
function normalizeForMatching(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Extract pattern patterns from a filename (without extension)
 */
function extractPatterns(filename: string): string {
  // Remove file extension
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  return normalizeForMatching(nameWithoutExt);
}

/**
 * Match an image filename to a placeholder type.
 * Uses pattern matching on normalized filename.
 * Returns the placeholder key (e.g. "dimensionalDrawing") or null if no match.
 */
function matchImageToPlaceholder(filename: string): keyof ImageUrlsMap | null {
  const patterns = extractPatterns(filename);

  // Pattern matching rules — order matters (more specific patterns first)
  const rules: Array<{
    key: keyof ImageUrlsMap;
    patterns: (RegExp | string)[];
  }> = [
    {
      key: "dimensionalDrawing",
      patterns: ["dimensionaldraw", "dimdr", "dimension", "drawing", "dimdiag"],
    },
    {
      key: "mountingHeight",
      patterns: ["mountingheight", "recommendedmount", "mountheight", "mounting"],
    },
    {
      key: "driverCompatibility",
      patterns: ["drivercompat", "drivercomp", "driver", "compatibility"],
    },
    {
      key: "illuminanceLevel",
      patterns: ["illuminance", "luxlevel", "illuminancelevel", "lux", "lumen"],
    },
    {
      key: "wiringDiagram",
      patterns: ["wiringdiagram", "wiringschematic", "electricaldiagram", "wiring"],
    },
    {
      key: "wiringLayout",
      patterns: ["wiringlayout", "wirelayout", "wiringplan"],
    },
    {
      key: "terminalLayout",
      patterns: ["terminallayout", "terminalblock", "terminalplan", "terminal"],
    },
    {
      key: "installation",
      patterns: ["installation", "installguide", "installstep", "install"],
    },
    {
      key: "base",
      patterns: [/^base$/, "basetype", "socketbase"],
    },
    {
      key: "accessories",
      patterns: ["accessor", "addon", "accessory"],
    },
    {
      key: "main",
      patterns: [
        "productimage",
        "mainimage",
        "productphoto",
        "photo",
        "image",
        "img",
        "picture",
        "pic",
      ],
    },
  ];

  // Try to match against each rule
  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      let matches = false;

      if (typeof pattern === "string") {
        matches = patterns.includes(normalizeForMatching(pattern));
      } else if (pattern instanceof RegExp) {
        matches = pattern.test(patterns);
      }

      if (matches) {
        return rule.key;
      }
    }
  }

  return null;
}

/**
 * Auto-match a collection of image files to their placeholders.
 * Returns a mapping of placeholder keys to image URLs.
 */
export function autoMatchImages(
  imageFiles: ImageFileWithUrl[]
): ImageUrlsMap {
  const result: ImageUrlsMap = {};

  for (const imageFile of imageFiles) {
    const placeholderKey = matchImageToPlaceholder(imageFile.name);
    if (placeholderKey) {
      result[placeholderKey] = imageFile.url;
    }
  }

  return result;
}

/**
 * Get a human-readable label for a placeholder key
 */
export function getPlaceholderLabel(key: keyof ImageUrlsMap): string {
  const labels: Record<keyof ImageUrlsMap, string> = {
    main: "Main Image",
    dimensionalDrawing: "Dimensional Drawing",
    mountingHeight: "Recommended Mounting Height",
    driverCompatibility: "Driver Compatibility",
    base: "Base",
    illuminanceLevel: "Illuminance Level",
    wiringDiagram: "Wiring Diagram",
    installation: "Installation",
    wiringLayout: "Wiring Layout",
    terminalLayout: "Terminal Layout",
    accessories: "Accessories",
  };
  return labels[key];
}
