import { describe, expect, test } from "bun:test";
import { isEligibleUpdate } from "../.github/scripts/merge-dependabot.mjs";

const eligible = {
  user: { login: "dependabot[bot]" },
  state: "open",
  draft: false,
  base: { ref: "main", repo: { full_name: "roseshot/TextBin" } },
  head: { ref: "dependabot/bun/wrangler-4.153.0", repo: { full_name: "roseshot/TextBin" } },
  title: "Bump wrangler from 4.152.0 to 4.153.0",
};

describe("Dependabot merge eligibility", () => {
  test("permits single-dependency minor and patch updates", () => {
    expect(isEligibleUpdate(eligible, ["package.json", "bun.lock"])).toBe(true);
    expect(isEligibleUpdate(
      { ...eligible, title: "chore(deps): bump wrangler from 4.152.0 to 4.152.1" },
      ["bun.lock"],
    )).toBe(true);
  });

  test("rejects major, downgrade, prerelease, or grouped updates", () => {
    for (const title of [
      "Bump wrangler from 4.152.0 to 5.0.0",
      "Bump wrangler from 4.152.0 to 4.151.0",
      "Bump wrangler from 4.152.0 to 4.153.0-rc.1",
      "Bump the bun group with 2 updates",
    ]) expect(isEligibleUpdate({ ...eligible, title }, ["bun.lock"])).toBe(false);
  });

  test("rejects humans, forks, unexpected files, and unrelated branches", () => {
    expect(isEligibleUpdate({ ...eligible, user: { login: "someone" } }, ["bun.lock"])).toBe(false);
    expect(isEligibleUpdate({ ...eligible, head: { ...eligible.head, repo: { full_name: "fork/repo" } } }, ["bun.lock"])).toBe(false);
    expect(isEligibleUpdate(eligible, ["bun.lock", "src/index.ts"])).toBe(false);
    expect(isEligibleUpdate({ ...eligible, head: { ...eligible.head, ref: "feature/branch" } }, ["bun.lock"])).toBe(false);
  });

  test("only allows the existing CI workflow for GitHub Actions updates", () => {
    const action = {
      ...eligible,
      title: "Bump actions/checkout from 7.0.0 to 7.1.0",
      head: { ...eligible.head, ref: "dependabot/github_actions/actions/checkout-7.1.0" },
    };
    expect(isEligibleUpdate(action, [".github/workflows/ci.yml"])).toBe(true);
    expect(isEligibleUpdate(action, [".github/workflows/merge-dependabot.yml"])).toBe(false);
  });

  test("treats 0.x minor updates as potentially breaking", () => {
    expect(isEligibleUpdate({ ...eligible, title: "Bump a from 0.7.0 to 0.8.0" }, ["bun.lock"])).toBe(false);
    expect(isEligibleUpdate({ ...eligible, title: "Bump a from 0.7.0 to 0.7.1" }, ["bun.lock"])).toBe(true);
  });
});
