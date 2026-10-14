import { expect, type Page } from "@playwright/test";
export async function selectBlock(page: Page, label: string, index = 0) {
  const options = page
    .getByLabel("Block to edit")
    .locator("option")
    .filter({ hasText: label });
  const value = await options.nth(index).getAttribute("value");
  await page.getByLabel("Block to edit").selectOption(value!);
}
export async function add(
  page: Page,
  parent: string,
  type: string,
  at: string,
  index = 0,
) {
  await selectBlock(page, parent, index);
  await page
    .getByLabel("New block", { exact: true })
    .selectOption({ label: type });
  await page
    .getByLabel("Attach at", { exact: true })
    .selectOption({ label: at });
  await page.getByRole("button", { name: "Add and connect block" }).click();
}
export async function constructMirror(page: Page) {
  await selectBlock(page, "Choose a move");
  await page.getByRole("button", { name: "Remove selected block" }).click();
  await add(page, "Strategy", "If / otherwise", "Decision");
  await add(page, "If / otherwise", "Compare", "Condition");
  await add(page, "Compare", "Observation", "Left value");
  await page
    .getByLabel("Observation", { exact: true })
    .selectOption({ label: "opponent last revealed move" });
  await add(page, "Compare", "Move value", "Right value");
  await page
    .getByLabel("Choice", { exact: true })
    .selectOption({ label: "betray" });
  await add(page, "If / otherwise", "Choose a move", "When true");
  await page
    .getByLabel("Choice", { exact: true })
    .selectOption({ label: "betray" });
  await add(page, "If / otherwise", "Choose a move", "Otherwise");
  await expect(
    page.getByLabel("Strategy summary", { exact: true }),
  ).toContainText("this opponent's last revealed move");
}
