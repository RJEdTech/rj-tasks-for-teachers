/* The Canvas API fields this extension reads. Everything else is ignored. */

export interface CanvasTerm {
  id?: string;
  name?: string;
  start_at?: string | null;
  end_at?: string | null;
}

export interface CanvasEnrollment {
  type: string; // 'teacher' | 'ta' | 'student' | 'designer' | 'observer' | ...
  role?: string;
  enrollment_state?: string;
}

export interface CanvasCourse {
  id: string;
  name: string;
  course_code?: string;
  workflow_state?: string; // 'available' when published, 'unpublished', 'completed'
  start_at?: string | null;
  end_at?: string | null;
  restrict_enrollments_to_course_dates?: boolean;
  term?: CanvasTerm | null;
  enrollments?: CanvasEnrollment[];
  apply_assignment_group_weights?: boolean;
  total_students?: number;
}

export interface AssignmentDate {
  id?: string;
  base?: boolean;
  title?: string;
  due_at: string | null;
  unlock_at?: string | null;
  lock_at?: string | null;
  set_type?: string; // 'CourseSection' | 'ADHOC' | 'Group' | 'Noop'
  set_id?: string | null;
}

export interface CanvasAssignment {
  id: string;
  name: string;
  course_id?: string;
  published: boolean;
  due_at: string | null;
  lock_at?: string | null;
  unlock_at?: string | null;
  all_dates?: AssignmentDate[];
  points_possible: number | null;
  grading_type: string; // 'points' | 'percent' | 'pass_fail' | 'letter_grade' | 'gpa_scale' | 'not_graded'
  assignment_group_id: string | null;
  submission_types?: string[];
  omit_from_final_grade?: boolean;
  needs_grading_count?: number;
  html_url?: string;
  /* set when a rubric is attached */
  rubric_settings?: { points_possible?: number | null } | null;
  use_rubric_for_grading?: boolean;
  /* classic quizzes and graded discussions are reached from Modules by these ids */
  quiz_id?: string | null;
  discussion_topic?: { id?: string } | null;
}

export interface CanvasModuleItem {
  id: string;
  type: string; // 'Assignment' | 'Quiz' | 'Discussion' | 'Page' | ...
  content_id?: string | null;
  published?: boolean;
}

export interface CanvasModule {
  id: string;
  name?: string;
  published?: boolean;
  items_count?: number;
  items?: CanvasModuleItem[]; // left out by Canvas when a module has very many items
}

export interface CanvasLatePolicy {
  late_policy?: { missing_submission_deduction_enabled?: boolean } | null;
}

export interface CanvasAssignmentGroup {
  id: string;
  name: string;
  group_weight: number | null;
}

export interface CanvasSubmission {
  id?: string;
  assignment_id: string;
  user_id: string;
  workflow_state: string; // 'submitted' | 'pending_review' | 'graded' | 'unsubmitted'
  submitted_at: string | null;
  late?: boolean;
  missing?: boolean;
  excused?: boolean | null;
  grade?: string | null;
  grade_matches_current_submission?: boolean | null;
  cached_due_date?: string | null; // this student's own due date (overrides applied)
}

export interface CanvasGradingPeriod {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
}

export interface CanvasUser {
  id: string;
  name: string;
  sortable_name?: string;
}

export interface TeacherCourse {
  id: string;
  name: string;
  code: string;
  weighted: boolean;
  /* the course's term dates (ms), when Canvas gives them */
  termStart?: number | null;
  termEnd?: number | null;
}
