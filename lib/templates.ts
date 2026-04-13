export interface TemplateTask {
  name: string;
  leadDays: number;
  sprint: number;
  estMinutes: number;
  workCategory: "GRADING" | "STANDARD";
}

export interface Template {
  key: string;
  label: string;
  description: string;
  tasks: TemplateTask[];
}

export const TEMPLATES: Template[] = [
  {
    key: "student-feedback",
    label: "Student Feedback",
    description: "Review, write, and return feedback with gradebook logging",
    tasks: [
      { name: "Review criteria & task requirements", leadDays: 7, sprint: 4, estMinutes: 20, workCategory: "GRADING" },
      { name: "Skim all submissions for range", leadDays: 6, sprint: 4, estMinutes: 30, workCategory: "GRADING" },
      { name: "Write feedback — first third of class", leadDays: 5, sprint: 4, estMinutes: 60, workCategory: "GRADING" },
      { name: "Write feedback — second third", leadDays: 4, sprint: 4, estMinutes: 60, workCategory: "GRADING" },
      { name: "Write feedback — final third", leadDays: 3, sprint: 4, estMinutes: 60, workCategory: "GRADING" },
      { name: "Check consistency & ATL alignment", leadDays: 1, sprint: 2, estMinutes: 30, workCategory: "GRADING" },
      { name: "Return feedback & log in gradebook", leadDays: 0, sprint: 3, estMinutes: 20, workCategory: "STANDARD" },
    ],
  },
  {
    key: "assessment-design",
    label: "Assessment Design",
    description: "Design MYP assessments from objectives to distribution",
    tasks: [
      { name: "Review unit objectives & MYP command terms", leadDays: 10, sprint: 4, estMinutes: 30, workCategory: "GRADING" },
      { name: "Draft task description & context", leadDays: 8, sprint: 4, estMinutes: 60, workCategory: "GRADING" },
      { name: "Write marking criteria & level descriptors", leadDays: 7, sprint: 4, estMinutes: 90, workCategory: "GRADING" },
      { name: "Create student-facing task sheet", leadDays: 5, sprint: 4, estMinutes: 45, workCategory: "GRADING" },
      { name: "Peer review task with colleague", leadDays: 4, sprint: 3, estMinutes: 30, workCategory: "STANDARD" },
      { name: "Revise based on feedback", leadDays: 3, sprint: 2, estMinutes: 30, workCategory: "GRADING" },
      { name: "Get HOD sign-off", leadDays: 2, sprint: 2, estMinutes: 15, workCategory: "STANDARD" },
      { name: "Upload to MIS & distribute to students", leadDays: 0, sprint: 3, estMinutes: 15, workCategory: "STANDARD" },
    ],
  },
  {
    key: "lesson-planning",
    label: "Lesson Planning",
    description: "Plan a lesson sequence aligned to ATL & design cycle",
    tasks: [
      { name: "Review unit plan & learning objectives", leadDays: 7, sprint: 4, estMinutes: 20, workCategory: "STANDARD" },
      { name: "Map lessons to ATL skills & design cycle", leadDays: 6, sprint: 4, estMinutes: 45, workCategory: "STANDARD" },
      { name: "Draft lesson sequence overview", leadDays: 5, sprint: 4, estMinutes: 60, workCategory: "STANDARD" },
      { name: "Prepare differentiated support scaffolds", leadDays: 3, sprint: 4, estMinutes: 45, workCategory: "STANDARD" },
      { name: "Build slide decks & activity instructions", leadDays: 2, sprint: 4, estMinutes: 60, workCategory: "STANDARD" },
      { name: "Review & adjust lesson timing", leadDays: 1, sprint: 2, estMinutes: 20, workCategory: "STANDARD" },
      { name: "Set up classroom & digital tools", leadDays: 0, sprint: 1, estMinutes: 20, workCategory: "STANDARD" },
    ],
  },
  {
    key: "unit-reflection",
    label: "Unit Reflection",
    description: "Analyse data, reflect and update unit plan",
    tasks: [
      { name: "Gather student work samples across levels", leadDays: 5, sprint: 2, estMinutes: 30, workCategory: "GRADING" },
      { name: "Analyse assessment data & trends", leadDays: 4, sprint: 4, estMinutes: 45, workCategory: "GRADING" },
      { name: "Reflect on ATL development & design cycle", leadDays: 3, sprint: 4, estMinutes: 30, workCategory: "STANDARD" },
      { name: "Draft unit reflection (what worked, changes)", leadDays: 2, sprint: 4, estMinutes: 45, workCategory: "STANDARD" },
      { name: "Update unit plan for next iteration", leadDays: 1, sprint: 4, estMinutes: 30, workCategory: "STANDARD" },
      { name: "Submit reflection to coordinator", leadDays: 0, sprint: 2, estMinutes: 10, workCategory: "STANDARD" },
    ],
  },
  {
    key: "collaborative-planning",
    label: "Collaborative Planning",
    description: "Plan interdisciplinary units with colleagues",
    tasks: [
      { name: "Identify interdisciplinary links & shared outcomes", leadDays: 7, sprint: 4, estMinutes: 30, workCategory: "STANDARD" },
      { name: "Prepare your unit overview to share", leadDays: 5, sprint: 4, estMinutes: 30, workCategory: "STANDARD" },
      { name: "Draft shared inquiry question & global context", leadDays: 4, sprint: 4, estMinutes: 45, workCategory: "STANDARD" },
      { name: "Align timelines with collaborating teachers", leadDays: 3, sprint: 3, estMinutes: 20, workCategory: "STANDARD" },
      { name: "Plan collaboration session agenda", leadDays: 2, sprint: 3, estMinutes: 20, workCategory: "STANDARD" },
      { name: "Run planning session & document decisions", leadDays: 1, sprint: 2, estMinutes: 60, workCategory: "STANDARD" },
      { name: "Update unit plan with agreed changes", leadDays: 0, sprint: 4, estMinutes: 30, workCategory: "STANDARD" },
    ],
  },
  {
    key: "moderation",
    label: "Moderation",
    description: "Apply criteria, compare marks, submit moderated grades",
    tasks: [
      { name: "Select representative work samples across grades", leadDays: 6, sprint: 2, estMinutes: 30, workCategory: "GRADING" },
      { name: "Apply criteria independently to each sample", leadDays: 5, sprint: 4, estMinutes: 60, workCategory: "GRADING" },
      { name: "Prepare rationale notes for each mark awarded", leadDays: 4, sprint: 4, estMinutes: 45, workCategory: "GRADING" },
      { name: "Share samples with moderation partner", leadDays: 3, sprint: 3, estMinutes: 15, workCategory: "STANDARD" },
      { name: "Compare marks & discuss discrepancies", leadDays: 2, sprint: 2, estMinutes: 60, workCategory: "GRADING" },
      { name: "Agree on final marks & document decisions", leadDays: 1, sprint: 2, estMinutes: 30, workCategory: "GRADING" },
      { name: "Submit moderated grades to coordinator", leadDays: 0, sprint: 1, estMinutes: 15, workCategory: "STANDARD" },
    ],
  },
  {
    key: "parent-communication",
    label: "Parent Communication",
    description: "Prepare and send priority parent messages",
    tasks: [
      { name: "Pull student data & recent assessment results", leadDays: 3, sprint: 3, estMinutes: 20, workCategory: "STANDARD" },
      { name: "Draft template for common scenarios", leadDays: 2, sprint: 4, estMinutes: 30, workCategory: "STANDARD" },
      { name: "Write messages for priority students", leadDays: 2, sprint: 2, estMinutes: 60, workCategory: "STANDARD" },
      { name: "Review messages for tone & accuracy", leadDays: 1, sprint: 2, estMinutes: 20, workCategory: "STANDARD" },
      { name: "Send messages & log in MIS", leadDays: 0, sprint: 1, estMinutes: 20, workCategory: "STANDARD" },
    ],
  },
  {
    key: "prepping-materials",
    label: "Prepping Materials",
    description: "Order, organise, and set out materials for practical lessons",
    tasks: [
      { name: "List required materials & quantities", leadDays: 5, sprint: 3, estMinutes: 20, workCategory: "STANDARD" },
      { name: "Check stock & identify what to order", leadDays: 4, sprint: 2, estMinutes: 20, workCategory: "STANDARD" },
      { name: "Submit orders or print digital resources", leadDays: 3, sprint: 2, estMinutes: 15, workCategory: "STANDARD" },
      { name: "Organise workspace & tool stations", leadDays: 1, sprint: 3, estMinutes: 30, workCategory: "STANDARD" },
      { name: "Prepare safety instructions & demo materials", leadDays: 1, sprint: 4, estMinutes: 30, workCategory: "STANDARD" },
      { name: "Set out materials & check equipment", leadDays: 0, sprint: 1, estMinutes: 20, workCategory: "STANDARD" },
    ],
  },
  {
    key: "creating-resources",
    label: "Creating Resources",
    description: "Design, build, pilot, and publish learning resources",
    tasks: [
      { name: "Define learning goal & target audience", leadDays: 7, sprint: 4, estMinutes: 20, workCategory: "STANDARD" },
      { name: "Research examples & gather inspiration", leadDays: 6, sprint: 4, estMinutes: 30, workCategory: "STANDARD" },
      { name: "Draft resource structure & key content", leadDays: 5, sprint: 4, estMinutes: 60, workCategory: "STANDARD" },
      { name: "Build first version (slides, worksheet, video)", leadDays: 3, sprint: 4, estMinutes: 90, workCategory: "STANDARD" },
      { name: "Pilot with a group or get peer review", leadDays: 2, sprint: 2, estMinutes: 30, workCategory: "STANDARD" },
      { name: "Revise & finalise resource", leadDays: 1, sprint: 4, estMinutes: 30, workCategory: "STANDARD" },
      { name: "Upload to shared drive & unit plan", leadDays: 0, sprint: 3, estMinutes: 10, workCategory: "STANDARD" },
    ],
  },
  {
    key: "udl-design",
    label: "UDL Design",
    description: "Remove barriers with Universal Design for Learning",
    tasks: [
      { name: "Audit current lesson for access barriers", leadDays: 7, sprint: 4, estMinutes: 30, workCategory: "STANDARD" },
      { name: "Identify UDL goals across three principles", leadDays: 6, sprint: 4, estMinutes: 30, workCategory: "STANDARD" },
      { name: "Design multiple means of representation", leadDays: 5, sprint: 4, estMinutes: 60, workCategory: "STANDARD" },
      { name: "Design multiple means of action & expression", leadDays: 4, sprint: 4, estMinutes: 60, workCategory: "STANDARD" },
      { name: "Design multiple means of engagement", leadDays: 3, sprint: 4, estMinutes: 45, workCategory: "STANDARD" },
      { name: "Build & adapt materials for each pathway", leadDays: 2, sprint: 4, estMinutes: 90, workCategory: "STANDARD" },
      { name: "Review with LST or learning support team", leadDays: 1, sprint: 3, estMinutes: 30, workCategory: "STANDARD" },
      { name: "Finalise & document in unit plan", leadDays: 0, sprint: 2, estMinutes: 20, workCategory: "STANDARD" },
    ],
  },
  {
    key: "report-writing",
    label: "Report Writing",
    description: "Write, proofread, and submit student reports",
    tasks: [
      { name: "Collect all assessment data & grades", leadDays: 5, sprint: 2, estMinutes: 30, workCategory: "GRADING" },
      { name: "Review grade descriptors & school guidelines", leadDays: 4, sprint: 3, estMinutes: 20, workCategory: "GRADING" },
      { name: "Write reports — first third of class", leadDays: 3, sprint: 4, estMinutes: 75, workCategory: "GRADING" },
      { name: "Write reports — second third", leadDays: 2, sprint: 4, estMinutes: 75, workCategory: "GRADING" },
      { name: "Write reports — final third", leadDays: 1, sprint: 4, estMinutes: 75, workCategory: "GRADING" },
      { name: "Proofread all reports for errors & tone", leadDays: 1, sprint: 2, estMinutes: 30, workCategory: "GRADING" },
      { name: "Submit to coordinator for review", leadDays: 0, sprint: 1, estMinutes: 10, workCategory: "STANDARD" },
    ],
  },
];
