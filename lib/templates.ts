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
    description: "Plan, launch, assess, and moderate a student Design Project",
    tasks: [
      { name: "Write project brief & context",                  leadDays: 30, sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Develop criteria, rubrics & level descriptors",  leadDays: 28, sprint: 4, estMinutes: 90,  workCategory: "GRADING"  },
      { name: "Create student task sheet & research resources", leadDays: 25, sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Set up project timeline & milestone schedule",   leadDays: 21, sprint: 3, estMinutes: 30,  workCategory: "STANDARD" },
      { name: "Launch project & distribute brief to students",  leadDays: 20, sprint: 2, estMinutes: 20,  workCategory: "STANDARD" },
      { name: "Check in on investigation phase (formative)",    leadDays: 14, sprint: 2, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Review design solutions & give feedback",        leadDays: 10, sprint: 4, estMinutes: 60,  workCategory: "GRADING"  },
      { name: "Support creation phase & check progress",        leadDays: 7,  sprint: 2, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Assess final products",                          leadDays: 3,  sprint: 2, estMinutes: 100, workCategory: "GRADING"  },
      { name: "Moderate assessment with colleague",             leadDays: 2,  sprint: 2, estMinutes: 60,  workCategory: "GRADING"  },
      { name: "Enter grades & return feedback to students",     leadDays: 0,  sprint: 1, estMinutes: 30,  workCategory: "STANDARD" },
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
