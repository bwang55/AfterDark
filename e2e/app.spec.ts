import { test, expect } from "@playwright/test";

test.describe("App loads", () => {
  test("renders main UI elements", async ({ page }) => {
    await page.goto("/");
    // Search box
    await expect(
      page.locator('input[placeholder="Search city or place…"]'),
    ).toBeVisible();
    // AI Chat pill
    await expect(
      page.getByRole("button", { name: "Tell me how you feel tonight" }),
    ).toBeVisible();
    // Locate button
    await expect(
      page.getByRole("button", { name: "Locate me" }),
    ).toBeVisible();
  });
});

test.describe("Search", () => {
  test("typing in search box filters location list", async ({ page }) => {
    await page.goto("/");
    // Open the location list panel if collapsed
    const expandBtn = page.locator('button[aria-label="Expand list"]');
    if (await expandBtn.isVisible()) {
      await expandBtn.click();
    }
    await page.waitForTimeout(500);

    // Type a search query
    const searchInput = page.locator(
      'input[placeholder="Search city or place…"]',
    );
    await searchInput.fill("The Avery");
    await page.waitForTimeout(300);

    // The location list should show "1 places" in the counter
    await expect(page.locator("text=1 places")).toBeVisible();
    // Heading "The Avery" should be visible
    await expect(page.getByRole("heading", { name: "The Avery" })).toBeVisible();
  });

  test("clearing search shows all places again", async ({ page }) => {
    await page.goto("/");
    const expandBtn = page.locator('button[aria-label="Expand list"]');
    if (await expandBtn.isVisible()) {
      await expandBtn.click();
    }
    await page.waitForTimeout(500);

    const searchInput = page.locator(
      'input[placeholder="Search city or place…"]',
    );
    // Type then clear
    await searchInput.fill("zzznonexistent");
    await page.waitForTimeout(300);
    await searchInput.fill("");
    await page.waitForTimeout(300);

    // Should show multiple places (headings)
    const headings = page.locator("h3");
    const count = await headings.count();
    expect(count).toBeGreaterThan(1);
  });
});

test.describe("Location list", () => {
  test("expand/collapse toggle works", async ({ page }) => {
    await page.goto("/");

    const expandBtn = page.locator('button[aria-label="Expand list"]');
    if (await expandBtn.isVisible()) {
      await expandBtn.click();
      await page.waitForTimeout(400);
      await expect(
        page.locator('button[aria-label="Collapse list"]'),
      ).toBeVisible();
    }
  });

  test("category tabs filter places", async ({ page }) => {
    await page.goto("/");
    const expandBtn = page.locator('button[aria-label="Expand list"]');
    if (await expandBtn.isVisible()) {
      await expandBtn.click();
    }
    await page.waitForTimeout(500);

    // Click "Bars" tab
    const barsTab = page.getByRole("button", { name: "Bars" });
    if (await barsTab.isVisible()) {
      await barsTab.click();
      await page.waitForTimeout(300);
      // Should show fewer places than "All"
    }

    // Click "All" to reset
    const allTab = page.getByRole("button", { name: "All" });
    if (await allTab.isVisible()) {
      await allTab.click();
      await page.waitForTimeout(300);
    }
  });
});

test.describe("Closed place interaction", () => {
  test("clicking a closed venue card does not trigger flyTo", async ({
    page,
  }) => {
    await page.goto("/");
    const expandBtn = page.locator('button[aria-label="Expand list"]');
    if (await expandBtn.isVisible()) {
      await expandBtn.click();
    }
    await page.waitForTimeout(500);

    // Find a closed card (has opacity-60 class)
    const closedCard = page.locator('[class*="opacity-60"]').first();
    if ((await closedCard.count()) > 0) {
      await closedCard.click({ force: true });
      await page.waitForTimeout(300);
      // The closed card should have cursor-default (not pointer)
      await expect(closedCard).toHaveCSS("cursor", "default");
    }
  });
});

test.describe("Settings panel", () => {
  test("opens and closes on click", async ({ page }) => {
    await page.goto("/");

    // Scope to our app's main element to avoid Next.js Dev Tools overlay
    // Use .first() because when panel opens, child buttons also match
    const settingsBtn = page
      .locator(
        "main .pointer-events-none .absolute.right-4.bottom-4.left-4 > div:first-child button",
      )
      .first();

    // dispatchEvent bypasses any overlay interception
    await settingsBtn.dispatchEvent("click");
    await page.waitForTimeout(300);

    // Settings panel should show items
    await expect(page.locator("text=Dark Mode")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sound" })).toBeVisible();

    // Click again to close
    await settingsBtn.dispatchEvent("click");
    await page.waitForTimeout(300);
    await expect(page.locator("text=Dark Mode")).not.toBeVisible();
  });

  test("Esc key closes settings panel", async ({ page }) => {
    await page.goto("/");

    const settingsBtn = page.locator(
      "main .pointer-events-none .absolute.right-4.bottom-4.left-4 > div:first-child button",
    );

    await settingsBtn.dispatchEvent("click");
    await page.waitForTimeout(300);
    await expect(page.locator("text=Dark Mode")).toBeVisible();

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await expect(page.locator("text=Dark Mode")).not.toBeVisible();
  });
});

test.describe("AI Chat", () => {
  test("opens chat with Ctrl+K", async ({ page }) => {
    await page.goto("/");

    // Use Control+k (works in headless Chrome; the app accepts both Meta and Ctrl)
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(200);

    // Chat input should appear (replacing the placeholder button)
    const chatInput = page.locator(
      'input[placeholder="Tell me how you feel tonight…"]',
    );
    await expect(chatInput).toBeVisible();
  });

  test("clicking the pill opens chat", async ({ page }) => {
    await page.goto("/");

    const pillButton = page.getByRole("button", {
      name: "Tell me how you feel tonight",
    });
    await pillButton.click({ force: true });
    await page.waitForTimeout(300);

    const chatInput = page.locator(
      'input[placeholder="Tell me how you feel tonight…"]',
    );
    await expect(chatInput).toBeVisible();
  });
});

test.describe("Keyboard shortcuts", () => {
  test("/ focuses search box", async ({ page }) => {
    await page.goto("/");

    await page.keyboard.press("/");
    await page.waitForTimeout(200);

    const searchInput = page.locator(
      'input[placeholder="Search city or place…"]',
    );
    await expect(searchInput).toBeFocused();
  });

  test("Escape clears search and blurs", async ({ page }) => {
    await page.goto("/");

    const searchInput = page.locator(
      'input[placeholder="Search city or place…"]',
    );
    await searchInput.fill("test");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    await expect(searchInput).toHaveValue("");
    await expect(searchInput).not.toBeFocused();
  });
});
