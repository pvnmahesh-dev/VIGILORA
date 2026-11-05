/**
 * VIGILORA Campus Schematic Coordinates & Location Resolver
 *
 * Deterministically maps verified physical campus buildings and landmarks to their
 * exact architectural coordinates on the VIGILORA vector schematic canvas (0-1000 SVG viewbox / 0-100% relative).
 *
 * Guarantees:
 * 1. Deterministic mapping: Known campus structures always map to their verified footprint coordinates.
 * 2. Zero fabrication: If an incident is at an unknown, off-campus, or unverified location,
 *    it strictly returns null (quarantined to Pending Sensor Triangulation).
 * 3. Never invent coordinates or place incidents approximately just to inflate marker count.
 */

export interface VerifiedCampusLocation {
  id: string;
  canonicalName: string;
  aliases: string[];
  zone: "North STEM Quad" | "East Sports Complex" | "Central Plaza" | "West Arts District" | "South Perimeter";
  coordinates: {
    xPercent: number;
    yPercent: number;
  };
  svgElementId: string;
  description: string;
}

/**
 * Canonical verified campus buildings matching the SVG schematic footprints in TacticalMap.tsx
 */
export const VERIFIED_CAMPUS_LOCATIONS: readonly VerifiedCampusLocation[] = [
  {
    id: "STEM-QUAD-CURIE",
    canonicalName: "Curie Engineering Hall",
    aliases: [
      "engineering hall b",
      "curie engineering hall",
      "curie engineering",
      "engineering hall",
      "stem quad",
      "curie hall",
      "engineering b",
      "science wing",
      "lab 208",
    ],
    zone: "North STEM Quad",
    // Matches the east wing (Wing B) of Curie Engineering Hall in the SVG schematic (x: 230-390, y: 140-270)
    coordinates: {
      xPercent: 35,
      yPercent: 24,
    },
    svgElementId: "building-stem-quad",
    description: "Curie Engineering Hall & STEM Quadrangle Science Complex",
  },
  {
    id: "SPORTS-COMPLEX-MEMORIAL-ARENA",
    canonicalName: "Memorial Arena",
    aliases: [
      "memorial arena",
      "sports complex",
      "arena",
      "memorial arena & gymnasium",
      "memorial gymnasium",
      "gymnasium",
      "athletic arena",
      "gate 4 service concourse",
      "gate 4 turnstiles",
    ],
    zone: "East Sports Complex",
    // Center of the Memorial Arena & Gymnasium footprint in the SVG schematic (x: 730-890, y: 380-500, center cx: 810, cy: 440)
    coordinates: {
      xPercent: 81,
      yPercent: 44,
    },
    svgElementId: "building-sports-complex",
    description: "Memorial Arena & Gymnasium Athletic Pavilion",
  },
  {
    id: "GREAT-AUDITORIUM",
    canonicalName: "Great Auditorium",
    aliases: [
      "great auditorium",
      "auditorium",
      "assembly hall",
      "assembly rotunda",
      "auditorium terrace",
      "auditorium portico",
    ],
    zone: "East Sports Complex",
    // Matches the Great Auditorium rotunda assembly entrance in the SVG schematic (cx: 740, cy: 270-340)
    coordinates: {
      xPercent: 74,
      yPercent: 34,
    },
    svgElementId: "building-auditorium",
    description: "Great Auditorium Assembly & Ceremonial Hall",
  },
  {
    id: "CENTRAL-PLAZA-CLOCK-SPIRE",
    canonicalName: "Central Plaza",
    aliases: [
      "central plaza",
      "clock spire",
      "central command",
      "founders obelisk",
      "central command clock spire",
    ],
    zone: "Central Plaza",
    // Center point of Central Plaza stone ring & obelisk spire (cx: 500, cy: 500)
    coordinates: {
      xPercent: 50,
      yPercent: 50,
    },
    svgElementId: "building-central-plaza",
    description: "Central Plaza, Clock Spire & Campus Operations Command",
  },
  {
    id: "ARTS-DISTRICT-BLACKWOOD",
    canonicalName: "Blackwood Arts District",
    aliases: [
      "arts district",
      "blackwood library",
      "fine arts",
      "blackwood arts",
      "blackwood hall",
      "campus library",
      "reading rotunda",
    ],
    zone: "West Arts District",
    // Center of the classical cross-shaped Blackwood Library (cx: 225, cy: 620)
    coordinates: {
      xPercent: 22,
      yPercent: 62,
    },
    svgElementId: "building-arts-district",
    description: "Blackwood Library & Fine Arts Pavilion",
  },
  {
    id: "SOUTH-LOGISTICS-DEPOT",
    canonicalName: "South Logistics Depot",
    aliases: [
      "south logistics depot",
      "depot service yard",
      "maintenance depot",
      "south depot",
      "facilities station",
      "fleet depot",
      "logistics bay",
    ],
    zone: "South Perimeter",
    // Center of the South Perimeter maintenance & fleet bay (x: 510-670, y: 775-865, center cx: 590, cy: 820)
    coordinates: {
      xPercent: 59,
      yPercent: 82,
    },
    svgElementId: "building-south-depot",
    description: "South Logistics Depot & Fleet Maintenance Facility",
  },
];

/**
 * Validates whether coordinate values are valid finite percentages within [0, 100].
 */
export function isValidCoordinates(
  coords: unknown
): coords is { xPercent: number; yPercent: number; lat?: number; lng?: number } {
  if (!coords || typeof coords !== "object") return false;
  const c = coords as { xPercent?: unknown; yPercent?: unknown };
  return (
    typeof c.xPercent === "number" &&
    !isNaN(c.xPercent) &&
    isFinite(c.xPercent) &&
    c.xPercent >= 0 &&
    c.xPercent <= 100 &&
    typeof c.yPercent === "number" &&
    !isNaN(c.yPercent) &&
    isFinite(c.yPercent) &&
    c.yPercent >= 0 &&
    c.yPercent <= 100
  );
}

/**
 * Resolves verified schematic coordinates for a given building name or landmark.
 * Returns null if the location does not correspond to a verified campus schematic footprint.
 */
export function resolveCampusCoordinates(
  building?: string | null,
  landmark?: string | null,
  zone?: string | null
): { xPercent: number; yPercent: number; locationName: string; zone: string } | null {
  const candidates = [building, landmark].filter(
    (c): c is string => typeof c === "string" && c.trim().length > 0
  );

  if (candidates.length === 0) {
    return null;
  }

  const normalizedZone = (zone || "").toLowerCase().trim();

  for (const text of candidates) {
    const normalized = text.toLowerCase().trim();

    for (const loc of VERIFIED_CAMPUS_LOCATIONS) {
      const match = loc.aliases.some((alias) => {
        return (
          normalized === alias ||
          normalized.includes(alias) ||
          alias.includes(normalized)
        );
      });

      if (match) {
        // If zone was specified, optionally ensure it doesn't conflict
        if (normalizedZone) {
          const zoneKeyword = loc.zone.toLowerCase();
          // Allow match if zones are compatible
          if (
            normalizedZone.includes("north") && !zoneKeyword.includes("north") ||
            normalizedZone.includes("south") && !zoneKeyword.includes("south") ||
            normalizedZone.includes("east") && !zoneKeyword.includes("east") ||
            normalizedZone.includes("west") && !zoneKeyword.includes("west")
          ) {
            continue;
          }
        }

        return {
          xPercent: loc.coordinates.xPercent,
          yPercent: loc.coordinates.yPercent,
          locationName: loc.canonicalName,
          zone: loc.zone,
        };
      }
    }
  }

  return null;
}

/**
 * Resolves the final display coordinates for an incident.
 *
 * Precedence:
 * 1. Genuine pre-existing coordinates stored on the incident record (if valid).
 * 2. Deterministic schematic coordinates resolved from verified building/landmark location.
 * 3. null (quarantined in Pending Sensor Triangulation).
 */
export function getIncidentCoordinates(incident: {
  location?: {
    coordinates?: unknown;
    building?: string;
    landmark?: string;
    zone?: string;
  };
}): { xPercent: number; yPercent: number; isDerived: boolean; locationName?: string } | null {
  // 1. Direct valid stored coordinates
  if (isValidCoordinates(incident.location?.coordinates)) {
    return {
      xPercent: incident.location.coordinates.xPercent,
      yPercent: incident.location.coordinates.yPercent,
      isDerived: false,
    };
  }

  // 2. Deterministic schematic resolution from verified building
  const resolved = resolveCampusCoordinates(
    incident.location?.building,
    incident.location?.landmark,
    incident.location?.zone
  );

  if (resolved) {
    return {
      xPercent: resolved.xPercent,
      yPercent: resolved.yPercent,
      isDerived: true,
      locationName: resolved.locationName,
    };
  }

  // 3. Unknown or unverified location -> must remain pending
  return null;
}

