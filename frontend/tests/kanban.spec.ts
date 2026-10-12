import { expect, type Page, test } from "@playwright/test";

const demoBoard = {
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-discovery", title: "Discovery", cardIds: ["card-3"] },
    { id: "col-progress", title: "In Progress", cardIds: ["card-4", "card-5"] },
    { id: "col-review", title: "Review", cardIds: ["card-6"] },
    { id: "col-done", title: "Done", cardIds: ["card-7", "card-8"] },
  ],
  cards: {
    "card-1": {
      id: "card-1",
      title: "Align roadmap themes",
      details: "Draft quarterly themes with impact statements and metrics.",
    },
    "card-2": {
      id: "card-2",
      title: "Gather customer signals",
      details: "Review support tags, sales notes, and churn feedback.",
    },
    "card-3": {
      id: "card-3",
      title: "Prototype analytics view",
      details: "Sketch initial dashboard layout and key drill-downs.",
    },
    "card-4": {
      id: "card-4",
      title: "Refine status language",
      details: "Standardize column labels and tone across the board.",
    },
    "card-5": {
      id: "card-5",
      title: "Design card layout",
      details: "Add hierarchy and spacing for scanning dense lists.",
    },
    "card-6": {
      id: "card-6",
      title: "QA micro-interactions",
      details: "Verify hover, focus, and loading states.",
    },
    "card-7": {
      id: "card-7",
      title: "Ship marketing page",
      details: "Final copy approved and asset pack delivered.",
    },
    "card-8": {
      id: "card-8",
      title: "Close onboarding sprint",
      details: "Document release notes and share internally.",
    },
  },
};

const login = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel(/username/i).fill("user");
  await page.getByLabel(/password/i).fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await page.getByRole("button", { name: /^close$/i }).click();
};

test.beforeEach(async ({ request }) => {
  await request.put("/api/board", { data: demoBoard });
});

test("requires sign in and supports logout", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);

  await page.getByLabel(/username/i).fill("user");
  await page.getByLabel(/password/i).fill("wrong");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText(/use username user and password password/i)).toBeVisible();

  await page.getByLabel(/password/i).fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();

  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("persists a new card after refresh", async ({ page }) => {
  await login(page);
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
  await login(page);

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
  await login(page);
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
  await login(page);

  await page.getByLabel(/new column title/i).fill("QA Lane");
  await page.getByRole("button", { name: /add column/i }).click();
  let column = page.locator('[data-testid^="column-"]').last();
  await expect(column.getByLabel("Column title")).toHaveValue("QA Lane");

  await column.getByLabel("Column title").fill("Validated");
  await column.getByLabel("Column title").press("Enter");
  await expect(column.getByLabel("Column title")).toHaveValue("Validated");

  await page.reload();
  await expect(page.getByText("Validated")).toBeVisible();

  column = page.locator('[data-testid^="column-"]').last();
  await expect(column.getByLabel("Column title")).toHaveValue("Validated");
  await column.getByRole("button", { name: /delete column validated/i }).click();
  await expect(page.getByText("Validated")).toHaveCount(0);
});

test("shows a chat reply and restores it after refresh", async ({ page }) => {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      json: { message: "Nothing changed.", board: null },
    });
  });

  await login(page);
  await page.getByRole("button", { name: /open chat/i }).click();
  await page.getByLabel(/message/i).fill("Hello");
  await page.getByRole("button", { name: /send/i }).click();
  await expect(page.getByText("Hello")).toBeVisible();
  await expect(page.getByText("Nothing changed.")).toBeVisible();
  await expect(page.getByText("Align roadmap themes")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Hello")).toBeVisible();
  await expect(page.getByText("Nothing changed.")).toBeVisible();
});

test("updates the board when chat returns a board", async ({ page }) => {
  const updatedBoard = structuredClone(demoBoard);
  updatedBoard.cards["card-chat"] = {
    id: "card-chat",
    title: "Chat card",
    details: "Added from chat.",
  };
  updatedBoard.columns[0].cardIds.push("card-chat");

  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      json: { message: "Added Chat card.", board: updatedBoard },
    });
  });

  await login(page);
  await page.getByRole("button", { name: /open chat/i }).click();
  await page.getByLabel(/message/i).fill("Add a card");
  await page.getByRole("button", { name: /send/i }).click();

  await expect(page.getByText("Added Chat card.")).toBeVisible();
  await expect(page.getByTestId("column-col-backlog").getByText("Chat card")).toBeVisible();
});
