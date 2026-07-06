/**
 * Barnacle
 */

const rules = [
  { label: "r: skill", message: "Skills should go to ClawHub" },
  { label: "r: support", message: "Use Discord for support" },
  { label: "r: spam", message: "Spam", close: true, lock: true },
];

export async function runBarnacleAutoResponse({ github, context, core }) {
  const target = context.payload.issue ?? context.payload.pull_request;
  if (!target) return;

  const labels = target.labels?.map(l => l.name) || [];
  const isMaintainer = await checkMaintainer(github, context, target.user.login);
  if (isMaintainer) {
    core.info(`Skipping maintainer PR #${target.number}`);
    return;
  }
  for (const rule of rules) {
    if (labels.includes(rule.label)) {
      await github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: target.number,
        body: rule.message,
      });

      if (rule.close) {
        await github.rest.issues.update({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: target.number,
          state: "closed",
        });
      }

      if (rule.lock) {
        await github.rest.issues.lock({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: target.number,
        });
      }
    }
  }
}

async function checkMaintainer(github, context, login) {
  try {
    const membership = await github.rest.teams.getMembershipForUserInOrg({
      org: context.repo.owner,
      team_slug: "maintainer",
      username: login,
    });
    return membership?.data?.state === "active";
  } catch {
    return false;
  }
}