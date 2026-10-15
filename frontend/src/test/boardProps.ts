export const boardProps = {
  boardId: 1,
  boardName: "Kanban Studio",
  onRenameBoard: () => Promise.resolve(),
  onDeleteBoard: () => undefined,
  onDuplicateBoard: () => undefined,
  onLeaveBoard: () => undefined,
  role: "owner" as const,
  owner: "alice",
  username: "alice",
  // Portal the chat into the test document, as the sidebar slot would.
  chatSlot: document.body,
};
