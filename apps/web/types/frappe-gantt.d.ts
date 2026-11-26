declare module "frappe-gantt" {
  export type GanttViewMode = "Quarter Day" | "Half Day" | "Day" | "Week" | "Month" | "Year";

  export interface GanttTask {
    id: string;
    name: string;
    start: string;
    end: string;
    progress?: number;
    dependencies?: string;
    custom_class?: string;
  }

  export interface GanttOptions {
    header_height?: number;
    column_width?: number;
    step?: number;
    view_modes?: GanttViewMode[];
    bar_height?: number;
    bar_corner_radius?: number;
    arrow_curve?: number;
    padding?: number;
    view_mode?: GanttViewMode;
    date_format?: string;
    popup_trigger?: string;
    custom_popup_html?: ((task: GanttTask) => string) | null;
    language?: string;
    on_click?: (task: GanttTask) => void;
    on_date_change?: (task: GanttTask, start: Date, end: Date) => void;
    on_progress_change?: (task: GanttTask, progress: number) => void;
    on_view_change?: (mode: GanttViewMode) => void;
  }

  export default class Gantt {
    constructor(
      wrapper: string | HTMLElement | SVGElement,
      tasks: GanttTask[],
      options?: GanttOptions
    );
    change_view_mode(mode?: GanttViewMode): void;
    refresh(tasks: GanttTask[]): void;
  }
}
