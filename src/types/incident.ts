export type IncidentSeverity = "Critical" | "High" | "Medium" | "Low";

export type IncidentStatus = 
  | "Reported" 
  | "Under review" 
  | "Assigned" 
  | "Responding" 
  | "Resolved";

export type IncidentCategory = 
  | "Medical Emergency"
  | "Security & Safety"
  | "Fire & Hazard"
  | "Crowd Disturbance"
  | "Suspicious Activity"
  | "Facilities & Power"
  | "Lost Person / Minor"
  | "General Assistance"
  | "Medical"
  | "Security"
  | "Fire and Hazard"
  | "Crowd Management"
  | "Infrastructure"
  | "Missing Person";

export interface IncidentLocation {
  zone: string;
  building?: string;
  floor?: string;
  coordinates?: {
    lat: number;
    lng: number;
    xPercent: number; // for interactive map visualization
    yPercent: number;
  };
  landmark?: string;
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  status: IncidentStatus;
  location: IncidentLocation;
  reportedAt: string;
  updatedAt: string;
  assignedResponder?: string;
  assignedTeamId?: string;
  reporterContact?: string;
  hasPhoto?: boolean;
  photoUrl?: string;
  photoUrls?: string[];
  evidenceList?: import("./evidence").EvidenceItem[];
  notesCount?: number;
  aiClassificationScore?: number; // 0-1 confidence score
  aiDuplicateCluster?: string;
  isCustomReported?: boolean; // distinguishes newly submitted demo records from seeded baseline
}

export interface ActivityEvent {
  id: string;
  incidentId: string;
  incidentTitle: string;
  action: string;
  actor: string;
  actorRole: "System AI" | "Dispatcher" | "Field Responder" | "Reporter" | "Supervisor";
  timestamp: string;
  severity: IncidentSeverity;
  type: "status_change" | "dispatch" | "alert" | "resolution" | "creation";
}
