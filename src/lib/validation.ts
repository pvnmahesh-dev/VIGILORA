/**
 * VIGILORA Server-Side Input & Evidence Validation
 *
 * Provides reusable validation functions for:
 * - Incident payloads, categories, severities, and locations
 * - Incident status transitions state machine
 * - Tactical team status transitions
 * - Evidence file MIME types, magic bytes, size limits, and S3 object keys
 */

import { IncidentCategory, IncidentSeverity, IncidentStatus } from "@/types/incident";
import { TeamStatus } from "@/types/team";

export const ALLOWED_CATEGORIES: readonly IncidentCategory[] = [
  "Medical Emergency",
  "Security & Safety",
  "Fire & Hazard",
  "Crowd Disturbance",
  "Suspicious Activity",
  "Facilities & Power",
  "Lost Person / Minor",
  "General Assistance",
  "Medical",
  "Security",
  "Fire and Hazard",
  "Crowd Management",
  "Infrastructure",
  "Missing Person",
] as const;

export const ALLOWED_SEVERITIES: readonly IncidentSeverity[] = [
  "Critical",
  "High",
  "Medium",
  "Low",
] as const;

export const ALLOWED_STATUSES: readonly IncidentStatus[] = [
  "Reported",
  "Under review",
  "Assigned",
  "Responding",
  "Resolved",
] as const;

export const ALLOWED_TEAM_STATUSES: readonly TeamStatus[] = [
  "Available",
  "En Route",
  "On Scene",
  "Busy",
  "Off Duty",
] as const;

// Evidence Image Constraints
export const MAX_EVIDENCE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MIN_EVIDENCE_SIZE_BYTES = 100; // 100 bytes minimum
export const ALLOWED_EVIDENCE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const S3_KEY_REGEX =
  /^evidence\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/[0-9]+-[0-9a-fA-F-]+\.(jpg|jpeg|png|webp)$/;

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

/**
 * Validates incident creation payload
 */
export function validateNewIncident(input: unknown): ValidationResult<{
  title: string;
  description: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  zone: string;
  building?: string;
  landmark?: string;
  reporterContact?: string;
  photoKey?: string;
  photoUrl?: string;
  coordinates?: { lat: number; lng: number; xPercent: number; yPercent: number };
  aiClassificationScore?: number;
}> {
  const errors: string[] = [];

  if (!input || typeof input !== "object") {
    return { success: false, errors: ["Request body must be a JSON object."] };
  }

  const obj = input as Record<string, unknown>;

  // Title
  if (!obj.title || typeof obj.title !== "string" || obj.title.trim().length < 3) {
    errors.push("Title is required and must be at least 3 characters.");
  } else if (obj.title.trim().length > 150) {
    errors.push("Title cannot exceed 150 characters.");
  }

  // Description
  if (!obj.description || typeof obj.description !== "string" || obj.description.trim().length < 10) {
    errors.push("Description is required and must be at least 10 characters.");
  } else if (obj.description.trim().length > 3000) {
    errors.push("Description cannot exceed 3000 characters.");
  }

  // Category
  if (!obj.category || !ALLOWED_CATEGORIES.includes(obj.category as IncidentCategory)) {
    errors.push(`Invalid category. Allowed values: ${ALLOWED_CATEGORIES.join(", ")}`);
  }

  // Severity
  if (!obj.severity || !ALLOWED_SEVERITIES.includes(obj.severity as IncidentSeverity)) {
    errors.push(`Invalid severity. Allowed values: ${ALLOWED_SEVERITIES.join(", ")}`);
  }

  // Zone
  if (!obj.zone || typeof obj.zone !== "string" || obj.zone.trim().length < 2) {
    errors.push("Zone location is required.");
  }

  // Optional Photo Key validation
  if (obj.photoKey !== undefined) {
    if (typeof obj.photoKey !== "string" || !S3_KEY_REGEX.test(obj.photoKey)) {
      errors.push("Invalid evidence photoKey format or path.");
    }
  }

  // Optional coordinates validation
  let coordinates: { lat: number; lng: number; xPercent: number; yPercent: number } | undefined = undefined;
  if (obj.coordinates !== undefined) {
    if (typeof obj.coordinates === "object" && obj.coordinates !== null) {
      const c = obj.coordinates as Record<string, unknown>;
      if (
        typeof c.lat === "number" &&
        typeof c.lng === "number" &&
        typeof c.xPercent === "number" &&
        typeof c.yPercent === "number"
      ) {
        coordinates = {
          lat: c.lat,
          lng: c.lng,
          xPercent: c.xPercent,
          yPercent: c.yPercent,
        };
      }
    }
  }

  // Optional AI classification score
  let aiClassificationScore: number | undefined = undefined;
  if (obj.aiClassificationScore !== undefined && obj.aiClassificationScore !== null) {
    if (typeof obj.aiClassificationScore === "number" && !isNaN(obj.aiClassificationScore)) {
      aiClassificationScore = Math.max(0, Math.min(1, Math.round(obj.aiClassificationScore * 100) / 100));
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      title: (obj.title as string).trim(),
      description: (obj.description as string).trim(),
      category: obj.category as IncidentCategory,
      severity: obj.severity as IncidentSeverity,
      zone: (obj.zone as string).trim(),
      building: typeof obj.building === "string" ? obj.building.trim() : undefined,
      landmark: typeof obj.landmark === "string" ? obj.landmark.trim() : undefined,
      reporterContact: typeof obj.reporterContact === "string" ? obj.reporterContact.trim() : undefined,
      photoKey: typeof obj.photoKey === "string" ? obj.photoKey : undefined,
      photoUrl: typeof obj.photoUrl === "string" ? obj.photoUrl : undefined,
      coordinates,
      aiClassificationScore,
    },
  };
}

/**
 * Validates updates to an existing incident
 */
export function validateIncidentUpdate(input: unknown): ValidationResult<{
  status?: IncidentStatus;
  title?: string;
  description?: string;
  severity?: IncidentSeverity;
  category?: IncidentCategory;
  notes?: string;
}> {
  if (!input || typeof input !== "object") {
    return { success: false, errors: ["Request body must be a JSON object."] };
  }

  const obj = input as Record<string, unknown>;
  const errors: string[] = [];

  if (obj.status !== undefined) {
    if (!ALLOWED_STATUSES.includes(obj.status as IncidentStatus)) {
      errors.push(`Invalid status. Allowed values: ${ALLOWED_STATUSES.join(", ")}`);
    }
  }

  if (obj.title !== undefined) {
    if (typeof obj.title !== "string" || obj.title.trim().length < 3) {
      errors.push("Title must be at least 3 characters.");
    } else if (obj.title.trim().length > 150) {
      errors.push("Title cannot exceed 150 characters.");
    }
  }

  if (obj.description !== undefined) {
    if (typeof obj.description !== "string" || obj.description.trim().length < 10) {
      errors.push("Description must be at least 10 characters.");
    } else if (obj.description.trim().length > 3000) {
      errors.push("Description cannot exceed 3000 characters.");
    }
  }

  if (obj.severity !== undefined) {
    if (!ALLOWED_SEVERITIES.includes(obj.severity as IncidentSeverity)) {
      errors.push(`Invalid severity. Allowed values: ${ALLOWED_SEVERITIES.join(", ")}`);
    }
  }

  if (obj.category !== undefined) {
    if (!ALLOWED_CATEGORIES.includes(obj.category as IncidentCategory)) {
      errors.push(`Invalid category. Allowed values: ${ALLOWED_CATEGORIES.join(", ")}`);
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      status: obj.status as IncidentStatus | undefined,
      title: typeof obj.title === "string" ? obj.title.trim() : undefined,
      description: typeof obj.description === "string" ? obj.description.trim() : undefined,
      severity: obj.severity as IncidentSeverity | undefined,
      category: obj.category as IncidentCategory | undefined,
      notes: typeof obj.notes === "string" ? obj.notes.trim() : undefined,
    },
  };
}

/**
 * State machine transition validation
 */
const VALID_STATUS_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  "Reported": ["Under review", "Assigned", "Responding", "Resolved"],
  "Under review": ["Assigned", "Responding", "Resolved"],
  "Assigned": ["Responding", "Under review", "Resolved"],
  "Responding": ["Resolved", "Under review", "Assigned"],
  "Resolved": ["Under review"], // Re-opening a resolved incident
} as const;

export function validateIncidentStatusTransition(
  currentStatus: IncidentStatus,
  targetStatus: IncidentStatus,
  userRole: string,
  hasAssignedTeam?: boolean
): { valid: boolean; error?: string } {
  if (currentStatus === targetStatus) {
    return { valid: true };
  }

  // Re-opening a resolved incident requires Supervisor role
  if (currentStatus === "Resolved") {
    if (userRole !== "Supervisor") {
      return {
        valid: false,
        error: "Only a Supervisor can re-open a previously resolved incident.",
      };
    }
    if (targetStatus !== "Under review") {
      return {
        valid: false,
        error: 'A resolved incident can only be transitioned back to "Under review".',
      };
    }
    return { valid: true };
  }

  const allowed = VALID_STATUS_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(targetStatus)) {
    return {
      valid: false,
      error: `Invalid operational transition from "${currentStatus}" to "${targetStatus}".`,
    };
  }

  // An incident cannot enter "Assigned" or "Responding" without an assigned tactical response unit
  if ((targetStatus === "Assigned" || targetStatus === "Responding") && !hasAssignedTeam) {
    return {
      valid: false,
      error: `Cannot transition incident to "${targetStatus}" without an assigned tactical response unit. Use the tactical unit assignment workflow.`,
    };
  }

  return { valid: true };
}

/**
 * Validates image buffer magic bytes against expected MIME type
 */
export function validateImageMagicBytes(
  buffer: Buffer,
  mimeType: string
): { valid: boolean; detectedFormat?: string } {
  if (buffer.length < 12) {
    return { valid: false };
  }

  // JPEG: starts with FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: mimeType === "image/jpeg", detectedFormat: "image/jpeg" };
  }

  // PNG: starts with 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: mimeType === "image/png", detectedFormat: "image/png" };
  }

  // WebP: starts with "RIFF" and has "WEBP" at bytes 8-11
  const riff = buffer.toString("ascii", 0, 4);
  const webp = buffer.toString("ascii", 8, 12);
  if (riff === "RIFF" && webp === "WEBP") {
    return { valid: mimeType === "image/webp", detectedFormat: "image/webp" };
  }

  return { valid: false };
}

/**
 * Validates S3 object key to prevent path traversal
 */
export function validateS3Key(key: string): boolean {
  if (!key || typeof key !== "string") return false;
  return S3_KEY_REGEX.test(key);
}

const PHONE_REGEX = /^\+?[0-9\s().-]{7,25}$/;

/**
 * Validates campus emergency settings updates
 */
export function validateSettingsUpdate(input: unknown): ValidationResult<{
  campusName?: string;
  dispatchHotline?: string;
  dispatchChannel?: string;
  autoEscalateCritical?: boolean;
  soundAlerts?: boolean;
  aiAutoTriage?: boolean;
}> {
  if (!input || typeof input !== "object") {
    return { success: false, errors: ["Request body must be a JSON object."] };
  }

  const obj = input as Record<string, unknown>;
  const errors: string[] = [];

  if (obj.campusName !== undefined) {
    if (typeof obj.campusName !== "string" || obj.campusName.trim().length < 3) {
      errors.push("campusName must be at least 3 characters.");
    } else if (obj.campusName.trim().length > 100) {
      errors.push("campusName cannot exceed 100 characters.");
    }
  }

  if (obj.dispatchHotline !== undefined) {
    if (typeof obj.dispatchHotline !== "string" || !PHONE_REGEX.test(obj.dispatchHotline.trim())) {
      errors.push("dispatchHotline must be a valid telephone format (7-25 digits/symbols).");
    }
  }

  if (obj.dispatchChannel !== undefined) {
    if (typeof obj.dispatchChannel !== "string" || obj.dispatchChannel.trim().length < 3) {
      errors.push("dispatchChannel must be at least 3 characters.");
    } else if (obj.dispatchChannel.trim().length > 50) {
      errors.push("dispatchChannel cannot exceed 50 characters.");
    }
  }

  if (obj.autoEscalateCritical !== undefined && typeof obj.autoEscalateCritical !== "boolean") {
    errors.push("autoEscalateCritical must be a boolean.");
  }

  if (obj.soundAlerts !== undefined && typeof obj.soundAlerts !== "boolean") {
    errors.push("soundAlerts must be a boolean.");
  }

  if (obj.aiAutoTriage !== undefined && typeof obj.aiAutoTriage !== "boolean") {
    errors.push("aiAutoTriage must be a boolean.");
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      campusName: typeof obj.campusName === "string" ? obj.campusName.trim() : undefined,
      dispatchHotline: typeof obj.dispatchHotline === "string" ? obj.dispatchHotline.trim() : undefined,
      dispatchChannel: typeof obj.dispatchChannel === "string" ? obj.dispatchChannel.trim() : undefined,
      autoEscalateCritical: typeof obj.autoEscalateCritical === "boolean" ? obj.autoEscalateCritical : undefined,
      soundAlerts: typeof obj.soundAlerts === "boolean" ? obj.soundAlerts : undefined,
      aiAutoTriage: typeof obj.aiAutoTriage === "boolean" ? obj.aiAutoTriage : undefined,
    },
  };
}

/**
 * Validates updates to tactical response team
 */
export function validateTeamUpdate(input: unknown): ValidationResult<{
  status?: TeamStatus;
  batteryStatus?: number;
  currentZone?: string;
  membersCount?: number;
  leadResponder?: string;
  contactChannel?: string;
}> {
  if (!input || typeof input !== "object") {
    return { success: false, errors: ["Request body must be a JSON object."] };
  }

  const obj = input as Record<string, unknown>;
  const errors: string[] = [];

  if (obj.status !== undefined) {
    if (!ALLOWED_TEAM_STATUSES.includes(obj.status as TeamStatus)) {
      errors.push(`Invalid status. Allowed values: ${ALLOWED_TEAM_STATUSES.join(", ")}`);
    }
  }

  if (obj.batteryStatus !== undefined) {
    if (typeof obj.batteryStatus !== "number" || obj.batteryStatus < 0 || obj.batteryStatus > 100) {
      errors.push("batteryStatus must be an integer between 0 and 100.");
    }
  }

  if (obj.currentZone !== undefined) {
    if (typeof obj.currentZone !== "string" || obj.currentZone.trim().length < 2) {
      errors.push("currentZone must be at least 2 characters.");
    } else if (obj.currentZone.trim().length > 100) {
      errors.push("currentZone cannot exceed 100 characters.");
    }
  }

  if (obj.membersCount !== undefined) {
    if (typeof obj.membersCount !== "number" || obj.membersCount < 1 || obj.membersCount > 50) {
      errors.push("membersCount must be a number between 1 and 50.");
    }
  }

  if (obj.leadResponder !== undefined) {
    if (typeof obj.leadResponder !== "string" || obj.leadResponder.trim().length < 2) {
      errors.push("leadResponder must be at least 2 characters.");
    } else if (obj.leadResponder.trim().length > 100) {
      errors.push("leadResponder cannot exceed 100 characters.");
    }
  }

  if (obj.contactChannel !== undefined) {
    if (typeof obj.contactChannel !== "string" || obj.contactChannel.trim().length < 2) {
      errors.push("contactChannel must be at least 2 characters.");
    } else if (obj.contactChannel.trim().length > 100) {
      errors.push("contactChannel cannot exceed 100 characters.");
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      status: obj.status as TeamStatus | undefined,
      batteryStatus: typeof obj.batteryStatus === "number" ? Math.round(obj.batteryStatus) : undefined,
      currentZone: typeof obj.currentZone === "string" ? obj.currentZone.trim() : undefined,
      membersCount: typeof obj.membersCount === "number" ? Math.round(obj.membersCount) : undefined,
      leadResponder: typeof obj.leadResponder === "string" ? obj.leadResponder.trim() : undefined,
      contactChannel: typeof obj.contactChannel === "string" ? obj.contactChannel.trim() : undefined,
    },
  };
}

/**
 * Sanitizes original filenames for safe storage and Content-Disposition headers.
 * Strips path separators, control characters, and limits length.
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== "string") {
    return "evidence.bin";
  }
  // Strip paths
  const base = filename.replace(/^.*[\\/]/, "");
  // Remove non-alphanumeric/safe chars
  const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  return sanitized.length > 0 ? sanitized : "evidence.bin";
}

