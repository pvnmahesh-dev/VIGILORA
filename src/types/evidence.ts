/**
 * VIGILORA Evidence & S3 Storage Types
 */

export type AllowedEvidenceMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface EvidenceRecord {
  id: string;
  incidentId: string;
  s3Key: string;
  s3Bucket: string;
  originalFilename: string;
  mimeType: AllowedEvidenceMimeType;
  fileSizeBytes: number;
  uploadedBy: string;
  uploadedByName?: string;
  uploadedByRole: string;
  uploadedAt: string;
  campusId: string;
  entityType: "EVIDENCE";
  url: string;
}

export interface UploadSuccessResponse {
  id: string;
  incidentId: string;
  url: string;
  mimeType: AllowedEvidenceMimeType;
  fileSizeBytes: number;
  originalFilename: string;
  uploadedAt: string;
}

export interface EvidenceItem {
  id?: string;
  url: string;
  originalFilename?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  uploadedAt?: string;
  uploadedBy?: string;
  uploadedByName?: string;
  uploadedByRole?: string;
  incidentId?: string;
  title?: string;
}

