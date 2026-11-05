export type TeamStatus = "Available" | "En Route" | "On Scene" | "Busy" | "Off Duty";

export type TeamSpecialty = 
  | "Campus Security"
  | "Emergency Medical Services"
  | "Fire & Safety Response"
  | "Crowd Management"
  | "Facilities & Hazmat"
  | "Night Watch Patrol";

export interface ResponseTeam {
  id: string;
  name: string;
  callsign: string;
  specialty: TeamSpecialty;
  status: TeamStatus;
  currentZone: string;
  membersCount: number;
  leadResponder: string;
  contactChannel: string;
  activeIncidentId?: string;
  activeIncidentTitle?: string;
  batteryStatus?: number; // 0-100%
  lastCheckIn: string;
}
