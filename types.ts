
export type ItemType = 'S' | 'T';
export type DependencyMode = 'SS' | 'FS' | 'SF' | 'FF';

export interface ProjectItem {
  id: string;          // Database UUID
  sId: number;         // Step ID (1, 2, 3...)
  tId: string;         // Task ID (e.g., "1.1", "-1" for steps)
  type: ItemType;      // S or T
  description: string;
  accountable: string; // Responsible person
  workDays: number;
  start: string;       // ISO date string
  end: string;         // ISO date string
  progress: number;    // 0-100
  mode: DependencyMode; // SS, FS, SF, FF
  color: string;       // Primary hex color
}

export interface Project {
  id: string;
  name: string;
  accountable: string;
  start: string;
  end: string;
  workDays: number;
  items: ProjectItem[];
  createdAt: number;
}

export interface Backup {
  timestamp: string;
  project: Project;
}

export interface GanttDimensions {
  rowHeight: number;
  dayWidth: number;
  headerHeight: number;
  timelineStart: Date;
  timelineEnd: Date;
}
