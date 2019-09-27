const { Toolkit } = require("actions-toolkit");

const tools = new Toolkit({
  event: ["pull_request.opened", "pull_request.closed"]
});

main().catch(err => {
  tools.log.fatal(err);
  tools.exit.failure();
});

async function main() {
  const pullRequest = tools.context.payload.pull_request;
  const event = tools.context.event;
  if (event === "pull_request.opened") {
    return await validate(pullRequest);
  }
  if (event === "pull_request.merged") {
    return await release(pullRequest);
  }
}

async function release(pullRequest) {
  const tag = getTagName();
  await tools.github.repos.createRelease({
    name: pullRequest.title,
    tag_name: tag,
    body: pullRequest.body,
    target_commitish: pullRequest.merge_commit_sha,
    ...tools.context.repo
  });
}

async function validate(pullRequest) {
  // Get context
  try {
    // Add release label
    await addLabel(pullRequest);
    // Check title
    checkTitle(pullRequest);
    // Check body
    checkBody(pullRequest);
    // Check that PR is from base to head
    checkBranches(pullRequest);
    // Check that release doesn't already exist
    await checkRelease(pullRequest);
  } catch (error) {
    if (error.name === ValidationError.constructor.name) {
      // Review if error is a ValidationError
      await review(pullRequest, REVIEW_REQUEST_CHANGES, error.message);
    }
    throw error;
  }
  // Approve Release
  await review(pullRequest, REVIEW_APPROVE, "Valid release.");
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

const REVIEW_APPROVE = "APPROVE";
const REVIEW_REQUEST_CHANGES = "REQUEST_CHANGES";
const REVIEW_REQUEST_COMMENT = "COMMENT";

function getTagName(pullRequest) {
  const { title } = pullRequest;
  return `releases/${title}`;
}

const releasePattern = "/^([0-9]{4})\\.([0-9]{2})\\.([0-9]{2})_\\d$/";

function checkTitle(title) {
  const match = releasePattern.exec(title);
  if (!match) {
    throw ValidationError("Invalid release title");
  }
  const [year, month, day] = match;
  const releaseDate = new Date(year, month, day);
  const today = new Date();
  if (releaseDate.toDateString() !== today.toDateString()) {
    throw ValidationError("Release date is not current");
  }
}

function checkBody(pullRequest) {
  const { body } = pullRequest;
  if (!body) {
    throw ValidationError("Missing description.");
  }
}

function checkBranches(pullRequest) {
  const expectedBase = core.getInput("base_branch", { required: true });
  const expectedHead = core.getInput("head_branch", { required: true });
  const base = pullRequest.base.ref;
  const head = pullRequest.head.ref;

  if (base !== expectedBase) {
    throw ValidationError(
      `Releases can only be made against ${expectedBase}. Check your action configuration.`
    );
  }
  if (head !== expectedHead) {
    throw ValidationError(
      `Releases can only be made from ${expectedHead}. Got ${head}.`
    );
  }
}

async function checkRelease(pullRequest) {
  const { title } = pullRequest;
  const tag = getTagName();
  try {
    await tools.github.repos.getReleaseByTag({
      tag: tag,
      ...tools.context.repo
    });
  } catch (error) {
    if (error.status === 404) {
      return;
    }
  }
  throw ValidationError("Release tag already exists");
}

async function addLabel(pullRequest) {
  await tools.github.issues.addLabels({
    number: pullRequest.number,
    labels: "Release",
    ...tools.context.repo
  });
}

async function review(pullRequest, event, comment) {
  await tools.github.pulls.createReview({
    number: pullRequest.number,
    body: comment,
    event: event,
    ...tools.context.repo
  });
}
