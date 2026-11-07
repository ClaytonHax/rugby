// Shared data contract. firestore.rules enforces the same shapes.
import type { Timestamp } from 'firebase/firestore';

export type Role = 'union_admin' | 'registrar' | 'school_admin' | 'coach' | 'manager' | 'scorer';

export const ROLE_LABELS: Record<Role, string> = {
  union_admin: 'Union administrator',
  registrar: 'Registrar',
  school_admin: 'School administrator',
  coach: 'Coach',
  manager: 'Team manager',
  scorer: 'Match scorer',
};

/** users/{uid} */
export interface AppUser {
  uid: string;
  email: string; // lowercase
  displayName: string;
  phone?: string;
  role: Role;
  schoolId: string | null; // null for union-level users and union-wide scorers
  active: boolean;
  createdAt: Timestamp;
}

/** invites/{lowercased email}. Deleted when claimed. */
export interface Invite {
  email: string;
  role: Role;
  schoolId: string | null;
  invitedBy: string;
  createdAt: Timestamp;
}

/** settings/competition (public read) */
export interface CompetitionSettings {
  overAgeYears: number; // a player is over-age when completed years > this. Default 18.
  maxOverAge: number; // Default 3.
}

/** schools/{id} (public) */
export interface School {
  id: string;
  name: string;
  town: string;
  province: string;
  shortName?: string;
}

export const AGE_GROUPS = ['U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'U19', '1st XV', '2nd XV', '3rd XV'] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

/** teams/{id} (public, no personal data) */
export interface Team {
  id: string;
  schoolId: string;
  schoolName: string;
  ageGroup: AgeGroup;
  side: string; // 'A', 'B'...
  season: number;
  name: string; // e.g. "Falcon College U16A"
}

/** teamRosters/{teamId} (private) */
export interface TeamRoster {
  teamId: string;
  schoolId: string;
  playerIds: string[];
  staffIds: string[];
  overAgeIds: string[]; // subset of playerIds over-age today
}

export type RecordStatus = 'draft' | 'pending' | 'verified' | 'rejected' | 'suspended';
export type IdType = 'birth_certificate' | 'national_id' | 'passport';

export const POSITIONS = [
  'Loosehead Prop', 'Hooker', 'Tighthead Prop', 'Lock', 'Blindside Flanker', 'Openside Flanker',
  'Number 8', 'Scrum-half', 'Fly-half', 'Left Wing', 'Inside Centre', 'Outside Centre', 'Right Wing', 'Fullback',
] as const;

/** Fields shared by players/{id} and staff/{id} (both private) */
export interface PersonBase {
  id: string;
  schoolId: string;
  schoolName: string;
  firstName: string;
  lastName: string;
  dob: string; // YYYY-MM-DD
  idType: IdType;
  idNumber: string;
  status: RecordStatus;
  rejectionReason?: string;
  registrationNo?: string; // set by union on verification: TL-<year>-<6 chars>
  teamIds: string[];
  docTypes: DocType[]; // which documents have finished uploading
  verifiedBy?: string;
  verifiedAt?: Timestamp;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Player extends PersonBase {
  position: string;
  secondaryPosition?: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail?: string;
  consentGiven: boolean; // guardian consent to store this data, required before 'pending'
  consentRecordedBy?: string;
  consentAt?: Timestamp;
}

export type StaffRole = 'head_coach' | 'assistant_coach' | 'manager' | 'medical';

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  head_coach: 'Head coach',
  assistant_coach: 'Assistant coach',
  manager: 'Team manager',
  medical: 'Medical / first aid',
};

export interface Staff extends PersonBase {
  staffRole: StaffRole;
  phone: string;
  email?: string;
  qualification?: string;
}

export type DocType = 'photo' | 'birth_certificate' | 'national_id' | 'passport' | 'qualification' | 'team_sheet';
export type DocOwnerType = 'player' | 'staff' | 'sheet';

/** documents/{ownerType_ownerId_type} (bytes in subcollection chunks/{index}: { data: Bytes }) */
export interface StoredDocument {
  id: string;
  ownerType: DocOwnerType;
  ownerId: string; // sheets: `${matchId}_${teamId}`
  schoolId: string;
  type: DocType;
  fileName: string;
  contentType: string;
  size: number;
  chunkCount: number;
  complete: boolean;
  uploadedBy: string;
  uploadedAt: Timestamp;
}

export type MatchStatus = 'scheduled' | 'live' | 'final' | 'cancelled';

/** matches/{id} (public) */
export interface Match {
  id: string;
  season: number;
  date: string; // YYYY-MM-DD
  kickoff: string; // HH:mm
  venue: string;
  town: string;
  competition: string;
  ageGroup: AgeGroup;
  homeTeamId: string;
  awayTeamId: string;
  homeName: string;
  awayName: string;
  schoolIds: string[]; // [home school, away school]
  referee?: string;
  status: MatchStatus;
  homeScore: number;
  awayScore: number;
  createdBy: string;
  createdAt: Timestamp;
}

export type ScoreType = 'try' | 'conversion' | 'penalty' | 'drop_goal' | 'penalty_try';

export const SCORE_POINTS: Record<ScoreType, number> = {
  try: 5, conversion: 2, penalty: 3, drop_goal: 3, penalty_try: 7,
};

/** matches/{id}/events/{id} (public: playerDisplay is initial + surname only) */
export interface ScoreEvent {
  id: string;
  type: ScoreType;
  teamId: string;
  playerId: string | null; // null for penalty tries
  playerDisplay: string; // "T. Moyo"
  minute: number;
  createdBy: string;
  createdAt: Timestamp;
}

/** matches/{id}/cards/{id} (private) */
export interface CardEvent {
  id: string;
  type: 'yellow' | 'red';
  teamId: string;
  playerId: string;
  playerName: string;
  minute: number;
  notes?: string;
  createdBy: string;
  createdAt: Timestamp;
}

export type SheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface SheetEntry {
  playerId: string;
  name: string;
  jersey: number; // 1-15 starters, 16-23 replacements
  position: string;
  isCaptain: boolean;
  overAge: boolean; // computed at the match date
}

/** matches/{id}/sheets/{teamId} (private to union, scorers and the two schools) */
export interface TeamSheet {
  matchId: string;
  teamId: string;
  schoolId: string;
  status: SheetStatus;
  entries: SheetEntry[];
  staffIds: string[];
  overAgeCount: number;
  scanDocId?: string;
  reviewNote?: string;
  submittedBy?: string;
  submittedAt?: Timestamp;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
}

/** auditLogs/{id} (create-only) */
export interface AuditLog {
  id: string;
  action: string; // e.g. 'player.verified'
  targetType: string;
  targetId: string;
  detail?: string;
  byUid: string;
  byName: string;
  at: Timestamp;
}
