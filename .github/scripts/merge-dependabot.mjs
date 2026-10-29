// Runs only from the trusted default branch after the "CI" workflow finishes.
// Never execute code from the triggering pull request in this privileged job.

function numbers(version) {
  if (!/^v?\d+(?:\.\d+){0,2}$/.test(version)) return null;
  const parts = version.replace(/^v/, "").split(".").map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) return null;
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

export function isEligibleUpdate(pull, paths) {
  if (
    pull.user?.login !== "dependabot[bot]" ||
    pull.state !== "open" ||
    pull.draft ||
    pull.base?.ref !== "main" ||
    pull.head?.repo?.full_name !== pull.base?.repo?.full_name
  ) return false;

  // Reject grouped updates and versions with ambiguous or prerelease suffixes.
  const match = /^(?:\w+(?:\([^)]*\))?:\s*)?bump .+ from (v?\d+(?:\.\d+){0,2}) to (v?\d+(?:\.\d+){0,2})$/i.exec(pull.title);
  if (!match) return false;
  const previous = numbers(match[1]);
  const next = numbers(match[2]);
  if (!previous || !next || previous[0] !== next[0]) return false;

  const minor = next[1] > previous[1];
  const patch = next[1] === previous[1] && next[2] > previous[2];
  if (!minor && !patch) return false;
  // A 0.x minor release may contain breaking changes.
  if (minor && previous[0] === 0) return false;

  if (paths.length === 0 || paths.length >= 100) return false;
  if (pull.head.ref.startsWith("dependabot/bun/")) {
    return paths.every((path) => path === "package.json" || path === "bun.lock");
  }
  if (pull.head.ref.startsWith("dependabot/github_actions/")) {
    // Updates to this privileged workflow or its script require manual review.
    return paths.every((path) => path === ".github/workflows/ci.yml");
  }
  return false;
}

async function github(path, options = {}) {
  const response = await fetch("https://api.github.com/repos/" + process.env.GH_REPOSITORY + "/" + path, {
    method: options.method ?? "GET",
    headers: {
      authorization: "Bearer " + process.env.GH_TOKEN,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  if (!response.ok) {
    throw new Error("GitHub API " + response.status + " while requesting " + path);
  }
  return response.json();
}

async function main() {
  if (!process.env.GH_TOKEN || !process.env.GH_REPOSITORY || !process.env.GH_RUN_ID) {
    throw new Error("Missing required GitHub Actions environment variables");
  }
  const run = await github("actions/runs/" + encodeURIComponent(process.env.GH_RUN_ID));
  const associated = run.pull_requests;
  if (
    run.name !== "CI" ||
    run.event !== "pull_request" ||
    run.conclusion !== "success" ||
    run.head_repository?.full_name !== process.env.GH_REPOSITORY ||
    run.actor?.login !== "dependabot[bot]" ||
    !Array.isArray(associated) ||
    associated.length !== 1
  ) {
    console.log("Skipping: not one successful Dependabot pull request CI run.");
    return;
  }

  const reference = associated[0];
  const pull = await github("pulls/" + reference.number);
  if (
    pull.head?.sha !== run.head_sha ||
    pull.head.sha !== reference.head?.sha ||
    pull.base?.sha !== reference.base?.sha
  ) {
    console.log("Skipping: pull request changed since the successful CI run.");
    return;
  }
  const files = await github("pulls/" + reference.number + "/files?per_page=100");
  if (!Array.isArray(files) || !isEligibleUpdate(pull, files.map((file) => file.filename))) {
    console.log("Skipping: major, prerelease, grouped, unrecognized, or unrelated change.");
    return;
  }

  console.log("Merging eligible Dependabot PR #" + reference.number + " at " + pull.head.sha);
  await github("pulls/" + reference.number + "/merge", {
    method: "PUT",
    body: { merge_method: "squash", sha: pull.head.sha },
  });
}

// Unit tests import the predicate without executing the GitHub API client.
if (process.argv[1]?.endsWith("merge-dependabot.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
