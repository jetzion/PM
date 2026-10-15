export type Priority = "low" | "medium" | "high";

export const PRIORITIES: Priority[] = ["low", "medium", "high"];

export type LabelColor = "yellow" | "blue" | "purple" | "navy" | "gray";

export const LABEL_COLORS: LabelColor[] = ["yellow", "blue", "purple", "navy", "gray"];

export type Label = {
  id: string;
  name: string;
  color: LabelColor;
};

export type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

export type Card = {
  id: string;
  title: string;
  details: string;
  priority: Priority;
  dueDate: string | null;
  labelIds: string[];
  checklist: ChecklistItem[];
  /** Read-only; comments are loaded per card. */
  commentCount: number;
};

/** The editable fields of a card, as sent to the API. Checklists and comments have their own routes. */
export type CardFields = Omit<Card, "id" | "checklist" | "commentCount">;

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
  labels: Label[];
  /** Cards in this column count as completed. */
  doneColumnId: string | null;
};

export const initialData: BoardData = {
  doneColumnId: "col-done",
  labels: [
    { id: "label-research", name: "Research", color: "blue" },
    { id: "label-design", name: "Design", color: "purple" },
    { id: "label-launch", name: "Launch", color: "yellow" },
  ],
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-discovery", title: "Discovery", cardIds: ["card-3"] },
    {
      id: "col-progress",
      title: "In Progress",
      cardIds: ["card-4", "card-5"],
    },
    { id: "col-review", title: "Review", cardIds: ["card-6"] },
    { id: "col-done", title: "Done", cardIds: ["card-7", "card-8"] },
  ],
  cards: {
    "card-1": {
      id: "card-1",
      title: "Align roadmap themes",
      details: "Draft quarterly themes with impact statements and metrics.",
      priority: "high",
      dueDate: null,
      labelIds: ["label-launch"],
      checklist: [],
      commentCount: 0,
    },
    "card-2": {
      id: "card-2",
      title: "Gather customer signals",
      details: "Review support tags, sales notes, and churn feedback.",
      priority: "medium",
      dueDate: null,
      labelIds: ["label-research"],
      checklist: [],
      commentCount: 0,
    },
    "card-3": {
      id: "card-3",
      title: "Prototype analytics view",
      details: "Sketch initial dashboard layout and key drill-downs.",
      priority: "medium",
      dueDate: null,
      labelIds: ["label-research", "label-design"],
      checklist: [],
      commentCount: 0,
    },
    "card-4": {
      id: "card-4",
      title: "Refine status language",
      details: "Standardize column labels and tone across the board.",
      priority: "low",
      dueDate: null,
      labelIds: [],
      checklist: [],
      commentCount: 0,
    },
    "card-5": {
      id: "card-5",
      title: "Design card layout",
      details: "Add hierarchy and spacing for scanning dense lists.",
      priority: "high",
      dueDate: null,
      labelIds: ["label-design"],
      checklist: [
        { id: "item-1", text: "Pick a spacing scale", done: true },
        { id: "item-2", text: "Review with design", done: false },
      ],
      commentCount: 0,
    },
    "card-6": {
      id: "card-6",
      title: "QA micro-interactions",
      details: "Verify hover, focus, and loading states.",
      priority: "medium",
      dueDate: null,
      labelIds: ["label-design"],
      checklist: [],
      commentCount: 0,
    },
    "card-7": {
      id: "card-7",
      title: "Ship marketing page",
      details: "Final copy approved and asset pack delivered.",
      priority: "low",
      dueDate: null,
      labelIds: ["label-launch"],
      checklist: [],
      commentCount: 0,
    },
    "card-8": {
      id: "card-8",
      title: "Close onboarding sprint",
      details: "Document release notes and share internally.",
      priority: "low",
      dueDate: null,
      labelIds: [],
      checklist: [],
      commentCount: 0,
    },
  },
};

const findColumn = (columns: Column[], id: string) =>
  columns.find((column) => column.id === id) ??
  columns.find((column) => column.cardIds.includes(id));

export const moveCard = (
  columns: Column[],
  activeId: string,
  overId: string
): Column[] => {
  const activeColumn = findColumn(columns, activeId);
  const overColumn = findColumn(columns, overId);
  if (!activeColumn || !overColumn) {
    return columns;
  }

  const activeIndex = activeColumn.cardIds.indexOf(activeId);
  if (activeIndex === -1) {
    return columns;
  }
  // Dropping on a column (not a card) appends to the end of it.
  const overIndex =
    overColumn.id === overId
      ? overColumn.cardIds.length
      : overColumn.cardIds.indexOf(overId);

  const sourceCardIds = [...activeColumn.cardIds];
  sourceCardIds.splice(activeIndex, 1);

  if (activeColumn.id === overColumn.id) {
    if (activeIndex === overIndex) {
      return columns;
    }
    sourceCardIds.splice(overIndex, 0, activeId);
    return columns.map((column) =>
      column.id === activeColumn.id ? { ...column, cardIds: sourceCardIds } : column
    );
  }

  const targetCardIds = [...overColumn.cardIds];
  targetCardIds.splice(overIndex, 0, activeId);

  return columns.map((column) => {
    if (column.id === activeColumn.id) {
      return { ...column, cardIds: sourceCardIds };
    }
    if (column.id === overColumn.id) {
      return { ...column, cardIds: targetCardIds };
    }
    return column;
  });
};

const pad = (value: number) => String(value).padStart(2, "0");

/** Local calendar date as YYYY-MM-DD, matching the API's dueDate format. */
export const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export type DueStatus = "done" | "overdue" | "today" | "upcoming";

export const dueStatus = (dueDate: string, today: string, isDone = false): DueStatus => {
  if (isDone) {
    return "done";
  }
  if (dueDate < today) {
    return "overdue";
  }
  return dueDate === today ? "today" : "upcoming";
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const formatDueDate = (dueDate: string) => {
  const [year, month, day] = dueDate.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
};

export type CardFilter = {
  text: string;
  priority: Priority | "any";
  labelId: string;
  overdueOnly: boolean;
};

export const emptyFilter: CardFilter = { text: "", priority: "any", labelId: "", overdueOnly: false };

export const isFilterActive = (filter: CardFilter) =>
  filter.text.trim() !== "" ||
  filter.priority !== "any" ||
  filter.labelId !== "" ||
  filter.overdueOnly;

/** True when the card passes every active filter. `today` is YYYY-MM-DD. */
export const cardMatches = (card: Card, filter: CardFilter, today: string, isDone = false) => {
  const text = filter.text.trim().toLowerCase();
  if (text && !`${card.title} ${card.details}`.toLowerCase().includes(text)) {
    return false;
  }
  if (filter.priority !== "any" && card.priority !== filter.priority) {
    return false;
  }
  if (filter.labelId && !card.labelIds.includes(filter.labelId)) {
    return false;
  }
  if (
    filter.overdueOnly &&
    !(card.dueDate && dueStatus(card.dueDate, today, isDone) === "overdue")
  ) {
    return false;
  }
  return true;
};
