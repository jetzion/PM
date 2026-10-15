import { expect, type Page, test } from "@playwright/test";
import { initialData } from "../src/lib/kanban";

const PASSWORD = "e2e-password";

const uniqueName = () => `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Register a fresh user through the API; the page shares its session cookie. */
const signUp = async (page: Page) => {
  const username = uniqueName();
  const response = await page.request.post("/api/auth/register", {
    data: { username, password: PASSWORD },
  });
  expect(response.status()).toBe(201);
  return username;
};

const openBoard = async (page: Page) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await page.getByRole("button", { name: /^close$/i }).click();
};

const boardsNav = (page: Page) => page.getByRole("navigation", { name: "Boards" });

test("registers through the UI, signs out, and signs back in", async ({ page }) => {
  const username = uniqueName();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);

  await page.getByRole("button", { name: /create an account/i }).click();
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill("short");
  await page.getByRole("button", { name: /^create account$/i }).click();
  await expect(page.getByText("Password must be at least 8 characters")).toBeVisible();

  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^create account$/i }).click();
  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();

  await page.reload();
  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible();

  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  expect((await page.request.get("/api/boards")).status()).toBe(401);

  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill("wrong-password");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByText("Invalid username or password")).toBeVisible();

  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible();
});

test("demo user can still sign in", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/username/i).fill("user");
  await page.getByLabel(/password/i).fill("password");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByText("Signed in as user")).toBeVisible();
});

test("each user only sees their own boards", async ({ browser }) => {
  // Separate contexts so the two users do not share cookies.
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const bobPage = await bobContext.newPage();

  await signUp(alice);
  await openBoard(alice);
  await alice.getByLabel("New board name").fill("Alice private");
  await alice.getByRole("button", { name: /^create$/i }).click();
  await expect(alice.getByRole("heading", { name: "Alice private" })).toBeVisible();

  await signUp(bobPage);
  await bobPage.goto("/");
  await expect(bobPage.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(boardsNav(bobPage).getByText("Alice private")).toHaveCount(0);

  await aliceContext.close();
  await bobContext.close();
});

test("creates, switches, renames, and deletes boards", async ({ page }) => {
  await signUp(page);
  await openBoard(page);

  await page.getByLabel("New board name").fill("Launch plan");
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByRole("heading", { name: "Launch plan" })).toBeVisible();
  await expect(page.getByTestId("column-col-todo")).toBeVisible();

  await page.getByTestId("column-col-todo").getByRole("button", { name: /add a card/i }).click();
  await page.getByPlaceholder("Card title").fill("Launch card");
  await page.getByTestId("column-col-todo").getByRole("button", { name: /add card/i }).click();
  await expect(boardsNav(page).getByRole("button", { name: /launch plan/i })).toContainText("1 cards");

  await boardsNav(page).getByRole("button", { name: /kanban studio/i }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.getByText("Launch card")).toHaveCount(0);

  // The last selected board is restored on reload.
  await boardsNav(page).getByRole("button", { name: /launch plan/i }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Launch plan" })).toBeVisible();
  await expect(page.getByText("Launch card")).toBeVisible();

  await page.getByRole("button", { name: /rename board/i }).click();
  await page.getByLabel("Board name", { exact: true }).fill("Go-live");
  await page.getByRole("button", { name: /save name/i }).click();
  await expect(page.getByRole("heading", { name: "Go-live" })).toBeVisible();
  await page.reload();
  await expect(boardsNav(page).getByRole("button", { name: /go-live/i })).toBeVisible();

  await page.getByRole("button", { name: /delete board/i }).click();
  await page.getByRole("button", { name: /confirm delete/i }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(boardsNav(page).getByText("Go-live")).toHaveCount(0);
});

test("changes the password", async ({ page }) => {
  const username = await signUp(page);
  await page.goto("/");
  await page.getByRole("button", { name: /^account$/i }).click();
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByLabel("New password").fill("rotated-password");
  await page.getByRole("button", { name: /update password/i }).click();
  await expect(page.getByText("Password updated.")).toBeVisible();

  await page.getByRole("button", { name: /log out/i }).click();
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill("rotated-password");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible();
});

test("persists a new card after refresh", async ({ page }) => {
  await signUp(page);
  await openBoard(page);
  const firstColumn = page.getByTestId("column-col-backlog");

  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Persistent card");
  await firstColumn.getByPlaceholder("Details").fill("Stored in SQLite.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Persistent card")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Persistent card")).toBeVisible();
});

test("edits a card and persists after refresh", async ({ page }) => {
  await signUp(page);
  await openBoard(page);

  const card = page.getByTestId("card-card-1");
  await card.getByRole("button", { name: /edit align roadmap themes/i }).click();
  await page.getByLabel(/edit title for align roadmap themes/i).fill("Edited roadmap themes");
  await page.getByLabel(/edit details for align roadmap themes/i).fill("Edited in the UI.");
  await card.getByRole("button", { name: /save/i }).click();
  await expect(page.getByText("Edited roadmap themes")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Edited roadmap themes")).toBeVisible();
});

test("moves a card between columns and persists after refresh", async ({ page }) => {
  await signUp(page);
  await openBoard(page);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  await card.scrollIntoViewIfNeeded();
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(columnBox.x + columnBox.width / 2, columnBox.y + 120, { steps: 12 });
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("column-col-review").getByTestId("card-card-1")).toBeVisible();
});

test("adds, renames, and deletes a column", async ({ page }) => {
  await signUp(page);
  await openBoard(page);

  await page.getByLabel(/new column title/i).fill("QA Lane");
  await page.getByRole("button", { name: /add column/i }).click();
  let column = page.locator('[data-testid^="column-"]').last();
  await expect(column.getByLabel("Column title")).toHaveValue("QA Lane");

  await column.getByLabel("Column title").fill("Validated");
  await column.getByLabel("Column title").press("Enter");
  await expect(column.getByLabel("Column title")).toHaveValue("Validated");

  await page.reload();
  column = page.locator('[data-testid^="column-"]').last();
  await expect(column.getByLabel("Column title")).toHaveValue("Validated");
  await column.getByRole("button", { name: /delete column validated/i }).click();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("shows a chat reply and restores it after refresh", async ({ page }) => {
  await page.route("**/api/boards/*/chat", async (route) => {
    await route.fulfill({ json: { message: "Nothing changed.", board: null } });
  });

  await signUp(page);
  await openBoard(page);
  await page.getByRole("button", { name: /open chat/i }).click();
  await page.getByLabel(/message/i).fill("Hello");
  await page.getByRole("button", { name: /send/i }).click();
  await expect(page.getByText("Hello")).toBeVisible();
  await expect(page.getByText("Nothing changed.")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Hello")).toBeVisible();
  await expect(page.getByText("Nothing changed.")).toBeVisible();
});

test("updates the board when chat returns a board", async ({ page }) => {
  const updatedBoard = structuredClone(initialData);
  updatedBoard.cards["card-chat"] = {
    id: "card-chat",
    title: "Chat card",
    details: "Added from chat.",
    priority: "high",
    dueDate: null,
    labelIds: [],
    checklist: [],
    commentCount: 0,
  };
  updatedBoard.columns[0].cardIds.push("card-chat");

  await page.route("**/api/boards/*/chat", async (route) => {
    await route.fulfill({ json: { message: "Added Chat card.", board: updatedBoard } });
  });

  await signUp(page);
  await openBoard(page);
  await page.getByRole("button", { name: /open chat/i }).click();
  await page.getByLabel(/message/i).fill("Add a card");
  await page.getByRole("button", { name: /send/i }).click();

  await expect(page.getByText("Added Chat card.")).toBeVisible();
  await expect(page.getByTestId("column-col-backlog").getByText("Chat card")).toBeVisible();
});

test("sets priority and due date on a card and persists them", async ({ page }) => {
  await signUp(page);
  await openBoard(page);
  const card = page.getByTestId("card-card-2");
  await expect(card.getByText("medium priority")).toBeVisible();

  await card.getByRole("button", { name: /edit gather customer signals/i }).click();
  await card.getByLabel(/priority for gather customer signals/i).selectOption("high");
  await card.getByLabel(/due date for gather customer signals/i).fill("2020-01-15");
  await card.getByRole("button", { name: /save/i }).click();

  await expect(card.getByText("high priority")).toBeVisible();
  await expect(card.getByText("Overdue Jan 15, 2020")).toBeVisible();

  await page.reload();
  const reloaded = page.getByTestId("card-card-2");
  await expect(reloaded.getByText("high priority")).toBeVisible();
  await expect(reloaded.getByText("Overdue Jan 15, 2020")).toBeVisible();

  await reloaded.getByRole("button", { name: /edit gather customer signals/i }).click();
  await reloaded.getByLabel(/due date for gather customer signals/i).fill("");
  await reloaded.getByRole("button", { name: /save/i }).click();
  await expect(reloaded.getByText(/overdue/i)).toHaveCount(0);
});

test("creates a label, tags a card, and deleting the label untags it", async ({ page }) => {
  await signUp(page);
  await openBoard(page);
  const card = page.getByTestId("card-card-4");

  await page.getByRole("button", { name: "Labels (3)" }).click();
  const panel = page.getByRole("region", { name: "Labels" });
  await panel.getByLabel("New label name").fill("Blocked");
  await panel.getByLabel("New label color").selectOption("navy");
  await panel.getByRole("button", { name: /add label/i }).click();
  await expect(panel.getByLabel("Name of label Blocked")).toBeVisible();

  await card.getByRole("button", { name: /edit refine status language/i }).click();
  await card.getByText("Blocked", { exact: true }).click();
  await card.getByRole("button", { name: /save/i }).click();
  await expect(card.locator('[data-label-color="navy"]')).toHaveText("Blocked");

  await page.reload();
  await expect(page.getByTestId("card-card-4").locator('[data-label-color="navy"]')).toHaveText(
    "Blocked"
  );

  await page.getByRole("button", { name: "Labels (4)" }).click();
  await page.getByRole("button", { name: "Delete label Blocked" }).click();
  await expect(page.getByTestId("card-card-4").getByText("Blocked")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Labels (3)" })).toBeVisible();
});

test("filters cards by text, label, priority, and overdue", async ({ page }) => {
  await signUp(page);
  // Give one card a past due date through the API so "Overdue only" has a match.
  const boardId = (await (await page.request.get("/api/boards")).json())[0].id;
  await page.request.patch(`/api/boards/${boardId}/cards/card-6`, {
    data: { dueDate: "2020-05-01" },
  });
  await openBoard(page);
  const cards = page.locator('[data-testid^="card-card-"]');
  await expect(cards).toHaveCount(8);

  await page.getByLabel("Search cards").fill("SIGNALS");
  await expect(cards).toHaveCount(1);
  await expect(page.getByText("Showing 1 of 8 cards")).toBeVisible();

  await page.getByRole("button", { name: /clear filters/i }).click();
  await page.getByLabel("Filter by label").selectOption({ label: "Launch" });
  await expect(cards).toHaveCount(2);
  await page.getByLabel("Filter by priority").selectOption("low");
  await expect(cards).toHaveCount(1);
  await expect(page.getByTestId("card-card-7")).toBeVisible();

  await page.getByRole("button", { name: /clear filters/i }).click();
  await page.getByLabel("Overdue only").check();
  await expect(cards).toHaveCount(1);
  await expect(page.getByTestId("card-card-6")).toContainText("Overdue May 1, 2020");
});

test("signs out everywhere", async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const page = await first.newPage();
  const other = await second.newPage();

  const username = await signUp(page);
  await other.request.post("/api/auth/login", { data: { username, password: PASSWORD } });
  await other.goto("/");
  await expect(other.getByText(`Signed in as ${username}`)).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: /^account$/i }).click();
  await page.getByRole("button", { name: /sign out everywhere/i }).click();
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();

  await other.reload();
  await expect(other.getByRole("heading", { name: /sign in/i })).toBeVisible();

  await first.close();
  await second.close();
});

test("deletes the account", async ({ page }) => {
  const username = await signUp(page);
  await page.goto("/");
  await page.getByRole("button", { name: /^account$/i }).click();
  await page.getByRole("button", { name: /^delete account$/i }).click();
  await page.getByLabel("Confirm password to delete").fill("wrong-password");
  await page.getByRole("button", { name: /delete forever/i }).click();
  await expect(page.getByText("Password is incorrect")).toBeVisible();

  await page.getByLabel("Confirm password to delete").fill(PASSWORD);
  await page.getByRole("button", { name: /delete forever/i }).click();
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();

  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByText("Invalid username or password")).toBeVisible();
});

test("overview summarizes boards and links to due cards", async ({ page }) => {
  await signUp(page);
  const boards = await (await page.request.get("/api/boards")).json();
  await page.request.patch(`/api/boards/${boards[0].id}/cards/card-2`, {
    data: { dueDate: "2020-03-04" },
  });
  const launch = await (await page.request.post("/api/boards", { data: { name: "Launch" } })).json();
  await page.request.post(`/api/boards/${launch.id}/cards`, {
    data: { columnId: "col-todo", title: "Book venue", priority: "high" },
  });

  await page.goto("/");
  await boardsNav(page).getByRole("button", { name: "Overview" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByTestId(`overview-board-${launch.id}`)).toContainText("1 cards");
  await expect(
    page.getByTestId(`overview-board-${boards[0].id}`).getByRole("img", {
      name: "Priority mix: 2 high, 3 medium, 3 low",
    })
  ).toBeVisible();

  // The overview is remembered across reloads.
  await page.reload();
  const due = page.getByRole("region", { name: "Due soon" });
  await expect(due.getByText("Overdue Mar 4, 2020")).toBeVisible();

  await due.getByRole("button", { name: /gather customer signals/i }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.getByTestId("card-card-2")).toContainText("Overdue Mar 4, 2020");
});

test("cards in the done column are not overdue", async ({ page }) => {
  await signUp(page);
  const [board] = await (await page.request.get("/api/boards")).json();
  await page.request.patch(`/api/boards/${board.id}/cards/card-1`, {
    data: { dueDate: "2020-02-02" },
  });
  await openBoard(page);
  const card = page.getByTestId("card-card-1");
  await expect(card.getByText("Overdue Feb 2, 2020")).toBeVisible();
  await expect(page.getByRole("button", { name: "Done column: Done" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await page.getByRole("button", { name: "Done column: Backlog" }).click();
  await expect(card.getByText("Done, was due Feb 2, 2020")).toBeVisible();
  await expect(page.getByText("5 columns, 8 cards, 2 done")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Done column: Backlog" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await boardsNav(page).getByRole("button", { name: "Overview" }).click();
  await expect(page.getByTestId(`overview-board-${board.id}`)).toContainText("8 cards, 2 done");
  await expect(page.getByTestId(`overview-board-${board.id}`)).not.toContainText("overdue");
  await expect(page.getByText("Nothing overdue or due in the next 7 days.")).toBeVisible();
});

test("builds a card checklist and persists progress", async ({ page }) => {
  await signUp(page);
  await openBoard(page);
  const card = page.getByTestId("card-card-1");

  await card.getByRole("button", { name: "Checklist for Align roadmap themes" }).click();
  const input = card.getByLabel("New checklist item for Align roadmap themes");

  // The open checklist must not push the card's action buttons outside the card.
  const cardBox = await card.boundingBox();
  const editBox = await card.getByRole("button", { name: /^edit align roadmap themes$/i }).boundingBox();
  expect(editBox!.x + editBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width);
  await input.fill("Draft themes");
  await input.press("Enter");
  await input.fill("Review with leads");
  await card.getByRole("button", { name: "Add", exact: true }).click();
  await expect(card.getByText("0/2 done")).toBeVisible();

  // The checkbox reflects the saved board, so it flips once the API responds.
  await card.getByRole("checkbox", { name: "Draft themes" }).click();
  await expect(card.getByRole("checkbox", { name: "Draft themes" })).toBeChecked();
  await expect(card.getByText("1/2 done")).toBeVisible();
  // Interacting with the checklist must not drag the card out of its column.
  await expect(page.getByTestId("column-col-backlog").getByTestId("card-card-1")).toBeVisible();

  await page.reload();
  const reloaded = page.getByTestId("card-card-1");
  await expect(reloaded.getByText("1/2 done")).toBeVisible();
  await reloaded.getByRole("button", { name: "Checklist for Align roadmap themes" }).click();
  await expect(reloaded.getByRole("checkbox", { name: "Draft themes" })).toBeChecked();
  await reloaded.getByRole("button", { name: "Remove checklist item Review with leads" }).click();
  await expect(reloaded.getByText("1/1 done")).toBeVisible();
});

test("comments on a card persist and survive an AI board update", async ({ page }) => {
  await signUp(page);
  await openBoard(page);
  const card = page.getByTestId("card-card-2");
  const toggle = card.getByRole("button", { name: "Comments for Gather customer signals" });
  await expect(toggle).toHaveText("Comments (0)");

  await toggle.click();
  await card.getByLabel("New comment for Gather customer signals").fill("Talked to support");
  await card.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(card.getByText("Talked to support")).toBeVisible();

  const cardBox = await card.boundingBox();
  const editBox = await card.getByRole("button", { name: /^edit gather customer signals$/i }).boundingBox();
  expect(editBox!.x + editBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width);

  // A real full-board replacement (what the AI does) must keep comments.
  const [board] = await (await page.request.get("/api/boards")).json();
  const data = await (await page.request.get(`/api/boards/${board.id}`)).json();
  data.cards["card-2"].title = "Gather customer signals";
  expect((await page.request.put(`/api/boards/${board.id}`, { data })).status()).toBe(200);

  await page.reload();
  const reloaded = page.getByTestId("card-card-2");
  await expect(reloaded.getByRole("button", { name: /comments for/i })).toHaveText("Comments (1)");
  await reloaded.getByRole("button", { name: /comments for/i }).click();
  await expect(reloaded.getByText("Talked to support")).toBeVisible();
});

test("duplicates a board as an independent copy", async ({ page }) => {
  await signUp(page);
  await openBoard(page);
  await page.getByRole("button", { name: /duplicate board/i }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio copy" })).toBeVisible();
  await expect(page.locator('[data-testid^="card-card-"]')).toHaveCount(8);

  await page.getByTestId("card-card-1").getByRole("button", { name: /remove|delete align/i }).first().click();
  await expect(page.locator('[data-testid^="card-card-"]')).toHaveCount(7);

  await boardsNav(page).getByRole("button", { name: /^kanban studio\s*8 cards$/i }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio", exact: true })).toBeVisible();
  await expect(page.locator('[data-testid^="card-card-"]')).toHaveCount(8);
});

test("shares a board with another user who can collaborate, then removes them", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const member = await memberContext.newPage();
  await signUp(owner);
  const memberName = await signUp(member);

  // The owner shares the board through the UI.
  await openBoard(owner);
  await owner.getByRole("button", { name: "Members" }).click();
  const panel = owner.getByRole("region", { name: "Members" });
  await panel.getByLabel("Share with username").fill(memberName);
  await panel.getByRole("button", { name: "Share" }).click();
  await expect(panel.getByText(memberName)).toBeVisible();

  // The member sees it, can edit content, but cannot rename or delete it.
  await member.goto("/");
  await boardsNav(member).getByRole("button", { name: /shared by/i }).click();
  await expect(member.getByRole("button", { name: /rename board/i })).toHaveCount(0);
  await expect(member.getByRole("button", { name: /delete board/i })).toHaveCount(0);
  const column = member.getByTestId("column-col-backlog");
  await column.getByRole("button", { name: /add a card/i }).click();
  await column.getByPlaceholder("Card title").fill("Added by member");
  await column.getByRole("button", { name: /add card/i }).click();
  await expect(column.getByText("Added by member")).toBeVisible();

  await owner.reload();
  await expect(owner.getByText("Added by member")).toBeVisible();

  // The owner removes the member, who loses access.
  await owner.getByRole("button", { name: /^close$/i }).click();
  await owner.getByRole("button", { name: "Members" }).click();
  await owner.getByRole("button", { name: `Remove ${memberName}` }).click();
  await expect(owner.getByRole("region", { name: "Members" }).getByText(memberName)).toHaveCount(0);

  await member.reload();
  await expect(boardsNav(member).getByText(/shared by/i)).toHaveCount(0);

  await ownerContext.close();
  await memberContext.close();
});

test("collapses the sidebar and keeps it collapsed after reload", async ({ page }) => {
  await signUp(page);
  await openBoard(page);
  const sidebar = page.getByRole("complementary", { name: "Workspace" });
  const leftBefore = (await page.getByTestId("column-col-backlog").boundingBox())!.x;

  await sidebar.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(boardsNav(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  // The board moves into the reclaimed space (columns keep their 280px minimum).
  expect((await page.getByTestId("column-col-backlog").boundingBox())!.x).toBeLessThan(
    leftBefore - 150
  );

  await page.reload();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  await expect(boardsNav(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(boardsNav(page).getByRole("button", { name: /kanban studio/i })).toBeVisible();
});

test("chat sits in the sidebar and stays scrolled to the newest message", async ({ page }) => {
  let count = 0;
  await page.route("**/api/boards/*/chat", async (route) => {
    count += 1;
    await route.fulfill({
      json: { message: `Reply number ${count} with enough words to take up a line or two.`, board: null },
    });
  });
  await signUp(page);
  await page.goto("/");
  // The chat sits in the lower part of the sidebar, filling the space between the
  // board list and the account buttons.
  const sidebar = page.getByRole("complementary", { name: "Workspace" });
  const chat = sidebar.getByRole("complementary", { name: "AI chat" });
  const chatBox = (await chat.boundingBox())!;
  const navBox = (await boardsNav(page).boundingBox())!;
  const logoutBox = (await sidebar.getByRole("button", { name: /log out/i }).boundingBox())!;
  expect(chatBox.y).toBeGreaterThan(navBox.y + navBox.height - 1);
  expect(chatBox.y + chatBox.height).toBeLessThan(logoutBox.y);
  expect(chatBox.height).toBeGreaterThanOrEqual(300);

  for (let index = 1; index <= 6; index += 1) {
    await page.getByLabel(/message/i).fill(`Question ${index}`);
    await page.getByRole("button", { name: /send/i }).click();
    await expect(chat.getByText(`Reply number ${index} with`)).toBeVisible();
  }

  const list = page.getByTestId("chat-messages");
  const atBottom = () =>
    list.evaluate((el) => el.scrollHeight > el.clientHeight && el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
  expect(await atBottom()).toBe(true);
  await expect(chat.getByText("Reply number 6 with")).toBeInViewport();

  // Restored history opens at the bottom too.
  await page.reload();
  await expect(page.getByRole("complementary", { name: "AI chat" }).getByText("Reply number 6 with")).toBeInViewport();
  expect(await atBottom()).toBe(true);
});

test("the board page does not scroll sideways on a phone", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await signUp(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();

  // Wide content (columns) must scroll inside its own container, never the page.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await context.close();
});
