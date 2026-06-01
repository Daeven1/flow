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
    key: "unit-building",
    label: "Unit Building",
    description: "Design a full MYP Design unit from concept to MIS submission",
    tasks: [
      { name: "Define unit overview & global context",          leadDays: 14, sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Write statement of inquiry & key concepts",      leadDays: 12, sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Design inquiry questions",                       leadDays: 11, sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Map ATL skills & learning experiences",          leadDays: 10, sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Plan summative assessment task",                 leadDays: 9,  sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Write criteria & rubrics",                       leadDays: 7,  sprint: 4, estMinutes: 90,  workCategory: "GRADING"  },
      { name: "Plan lesson sequence",                           leadDays: 5,  sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Create or gather key resources",                 leadDays: 3,  sprint: 4, estMinutes: 90,  workCategory: "STANDARD" },
      { name: "Peer review unit plan with colleague",           leadDays: 2,  sprint: 3, estMinutes: 30,  workCategory: "STANDARD" },
      { name: "Revise based on feedback",                       leadDays: 1,  sprint: 2, estMinutes: 30,  workCategory: "STANDARD" },
      { name: "Upload to MIS & share with team",                leadDays: 0,  sprint: 3, estMinutes: 20,  workCategory: "STANDARD" },
    ],
  },
  {
    key: "workshop-planning",
    label: "Workshop Planning",
    description: "Plan and deliver a professional learning workshop",
    tasks: [
      { name: "Define workshop goals & target audience",        leadDays: 10, sprint: 4, estMinutes: 30,  workCategory: "STANDARD" },
      { name: "Research content & gather examples",             leadDays: 9,  sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Design agenda & session flow",                   leadDays: 7,  sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Build slide deck & visuals",                     leadDays: 5,  sprint: 4, estMinutes: 90,  workCategory: "STANDARD" },
      { name: "Prepare participant activities & handouts",      leadDays: 4,  sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Rehearse & time the session",                    leadDays: 3,  sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Print materials & confirm room / tech setup",    leadDays: 1,  sprint: 2, estMinutes: 30,  workCategory: "STANDARD" },
      { name: "Deliver workshop",                               leadDays: 0,  sprint: 1, estMinutes: 90,  workCategory: "STANDARD" },
      { name: "Send follow-up resources & reflection prompt",   leadDays: 0,  sprint: 3, estMinutes: 20,  workCategory: "STANDARD" },
    ],
  },
  {
    key: "curriculum-review",
    label: "Curriculum Review",
    description: "Review, revise, and resubmit curriculum documentation",
    tasks: [
      { name: "Define scope of review & success criteria",      leadDays: 10, sprint: 4, estMinutes: 30,  workCategory: "STANDARD" },
      { name: "Gather student data & assessment trends",        leadDays: 9,  sprint: 4, estMinutes: 45,  workCategory: "GRADING"  },
      { name: "Review current units against MYP framework",     leadDays: 7,  sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Research updates (IB guide, best practices)",    leadDays: 6,  sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Identify gaps & draft proposed revisions",       leadDays: 5,  sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Update scope & sequence document",               leadDays: 4,  sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Revise affected unit plans",                     leadDays: 3,  sprint: 4, estMinutes: 90,  workCategory: "STANDARD" },
      { name: "Peer review with department",                    leadDays: 2,  sprint: 3, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Incorporate feedback & finalise",                leadDays: 1,  sprint: 2, estMinutes: 30,  workCategory: "STANDARD" },
      { name: "Submit to coordinator / upload to MIS",          leadDays: 0,  sprint: 2, estMinutes: 20,  workCategory: "STANDARD" },
    ],
  },
  {
    key: "professional-learning-goal",
    label: "Professional Learning Goal",
    description: "Set, pursue, document, and share a professional growth goal",
    tasks: [
      { name: "Define goal & success criteria",                 leadDays: 14, sprint: 4, estMinutes: 30,  workCategory: "STANDARD" },
      { name: "Map learning pathways & gather resources",       leadDays: 12, sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Schedule dedicated learning blocks",             leadDays: 11, sprint: 3, estMinutes: 20,  workCategory: "STANDARD" },
      { name: "Complete research / reading / course",           leadDays: 9,  sprint: 4, estMinutes: 90,  workCategory: "STANDARD" },
      { name: "Observe or connect with expert / colleague",     leadDays: 7,  sprint: 3, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Apply learning in classroom practice",           leadDays: 5,  sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Collect evidence & write reflection",            leadDays: 3,  sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Share learning with department or team",         leadDays: 1,  sprint: 3, estMinutes: 30,  workCategory: "STANDARD" },
      { name: "Update formal professional growth plan",         leadDays: 0,  sprint: 3, estMinutes: 20,  workCategory: "STANDARD" },
    ],
  },
  {
    key: "design-project",
    label: "Design Project",
    description: "Personal creative or purposeful making project — builds skills with tools and materials taught in class",
    tasks: [
      { name: "Define the project goal & purpose",              leadDays: 14, sprint: 4, estMinutes: 30,  workCategory: "STANDARD" },
      { name: "Research techniques, materials & inspiration",   leadDays: 12, sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Sketch designs & choose direction",              leadDays: 10, sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Gather materials & set up workspace / tools",    leadDays: 8,  sprint: 3, estMinutes: 30,  workCategory: "STANDARD" },
      { name: "Build prototype or first version",               leadDays: 6,  sprint: 4, estMinutes: 90,  workCategory: "STANDARD" },
      { name: "Test, evaluate & identify improvements",         leadDays: 4,  sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Refine & create final version",                  leadDays: 2,  sprint: 4, estMinutes: 90,  workCategory: "STANDARD" },
      { name: "Document process with photos & notes",           leadDays: 1,  sprint: 4, estMinutes: 30,  workCategory: "STANDARD" },
      { name: "Reflect on skills learned & teaching connections",leadDays: 0,  sprint: 4, estMinutes: 20,  workCategory: "STANDARD" },
    ],
  },
  {
    key: "resource-system-build",
    label: "Resource / System Build",
    description: "Design, build, and deploy a tool, AI workflow, or system",
    tasks: [
      { name: "Define the problem & desired outcome",           leadDays: 10, sprint: 4, estMinutes: 30,  workCategory: "STANDARD" },
      { name: "Research tools, approaches & examples",          leadDays: 9,  sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Sketch system design or workflow map",           leadDays: 7,  sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Build initial prototype or first version",       leadDays: 5,  sprint: 4, estMinutes: 90,  workCategory: "STANDARD" },
      { name: "Test & gather feedback",                         leadDays: 4,  sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Iterate & refine",                               leadDays: 3,  sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Write documentation or user guide",              leadDays: 2,  sprint: 4, estMinutes: 30,  workCategory: "STANDARD" },
      { name: "Share with team & incorporate feedback",         leadDays: 1,  sprint: 3, estMinutes: 30,  workCategory: "STANDARD" },
      { name: "Deploy / finalise & set up maintenance plan",    leadDays: 0,  sprint: 2, estMinutes: 20,  workCategory: "STANDARD" },
    ],
  },
];

export const STUDENT_TEMPLATES: Template[] = [
  {
    key: "ia-research",
    label: "IA Research",
    description: "Internal Assessment — research, write-up, and submission",
    tasks: [
      { name: "Define topic and research question",        leadDays: 21, sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Write initial literature review",           leadDays: 17, sprint: 4, estMinutes: 90,  workCategory: "STANDARD" },
      { name: "Design methodology or experiment",          leadDays: 14, sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Collect or gather data",                    leadDays: 10, sprint: 4, estMinutes: 90,  workCategory: "STANDARD" },
      { name: "Analyse data and interpret results",        leadDays: 7,  sprint: 4, estMinutes: 90,  workCategory: "GRADING"  },
      { name: "Write discussion and conclusion",           leadDays: 5,  sprint: 4, estMinutes: 60,  workCategory: "GRADING"  },
      { name: "Write full first draft",                    leadDays: 3,  sprint: 4, estMinutes: 90,  workCategory: "GRADING"  },
      { name: "Revise and edit",                           leadDays: 1,  sprint: 2, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Final proofread and submit",                leadDays: 0,  sprint: 1, estMinutes: 30,  workCategory: "STANDARD" },
    ],
  },
  {
    key: "extended-essay",
    label: "Extended Essay",
    description: "4000-word independent research essay for the IB Diploma",
    tasks: [
      { name: "Choose topic and meet supervisor",          leadDays: 30, sprint: 4, estMinutes: 30,  workCategory: "STANDARD" },
      { name: "Finalise research question",                leadDays: 25, sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Conduct research",                          leadDays: 18, sprint: 4, estMinutes: 120, workCategory: "GRADING"  },
      { name: "Write first draft outline",                 leadDays: 14, sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Write first full draft",                    leadDays: 10, sprint: 4, estMinutes: 120, workCategory: "GRADING"  },
      { name: "Supervisor review meeting",                 leadDays: 7,  sprint: 3, estMinutes: 30,  workCategory: "STANDARD" },
      { name: "Revise based on feedback",                  leadDays: 4,  sprint: 4, estMinutes: 90,  workCategory: "GRADING"  },
      { name: "Final proofread and format",                leadDays: 1,  sprint: 2, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Submit Extended Essay",                     leadDays: 0,  sprint: 1, estMinutes: 20,  workCategory: "STANDARD" },
    ],
  },
  {
    key: "cas-project",
    label: "CAS Project",
    description: "Creativity, Activity, Service project lifecycle",
    tasks: [
      { name: "Define CAS project theme and goals",        leadDays: 21, sprint: 4, estMinutes: 30,  workCategory: "STANDARD" },
      { name: "Plan activities and timeline",              leadDays: 18, sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Complete Creativity component",             leadDays: 14, sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Complete Activity component",               leadDays: 10, sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Complete Service component",                leadDays: 7,  sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Write CAS reflections",                     leadDays: 3,  sprint: 4, estMinutes: 45,  workCategory: "GRADING"  },
      { name: "Final portfolio review",                    leadDays: 1,  sprint: 3, estMinutes: 30,  workCategory: "STANDARD" },
      { name: "Submit CAS portfolio",                      leadDays: 0,  sprint: 1, estMinutes: 20,  workCategory: "STANDARD" },
    ],
  },
  {
    key: "design-cycle-project",
    label: "Design Cycle Project",
    description: "MYP Design cycle — Inquire, Develop, Create, Evaluate",
    tasks: [
      { name: "Inquire and Analyse — define the problem",  leadDays: 14, sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Research existing solutions",               leadDays: 12, sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Develop design brief and specifications",   leadDays: 10, sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Create design ideas and choose direction",  leadDays: 8,  sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Plan creation process",                     leadDays: 6,  sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Create the solution",                       leadDays: 4,  sprint: 4, estMinutes: 90,  workCategory: "STANDARD" },
      { name: "Test and evaluate against criteria",        leadDays: 2,  sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Write final reflection and submit",         leadDays: 0,  sprint: 2, estMinutes: 30,  workCategory: "GRADING"  },
    ],
  },
];
