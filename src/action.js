const util = require("util");
const core = require("@actions/core");
const github = require("@actions/github");

const client = new github.GitHub(
  core.getInput("repo_token", { required: true })
);

async function action() {
  const action = github.context.payload.action;
  const pullRequest = github.context.payload.pull_request;
  if (pullRequest == null) {
    core.error("Found no pull request.");
    return;
  }
  const validateActions = ["opened", "edited", "reopened"];
  if (validateActions.includes(action)) {
    core.info(`Validating pull request.`);
    await validate(pullRequest);
  } else if (action === "closed" && pullRequest.merged) {
    core.info(`Creating release.`);
    await release(pullRequest);
  } else {
    core.info(`Skipping since ${action} is not handled by this action.`);
    return;
  }
  core.info(`Finished running.`);
  core.setOutput("release", pullRequest.title);
}

async function validate(pullRequest) {
  try {
    // Add release label
    await addLabel(pullRequest);
    // Check title
    validateTitle(pullRequest);
    // Check body
    validateBody(pullRequest);
    // Check that PR is from base to head
    validateBranches(pullRequest);
    // Check that release doesn't already exist
    await validateRelease(pullRequest);
  } catch (error) {
    if (error.name === "ValidationError") {
      // Review if error is a ValidationError
      await review(pullRequest, getReviewFailEvent(), error.message);
    }
    throw error;
  }
  // Approve Release
  await review(pullRequest, getReviewApproveEvent(), "Valid release.");
  return pullRequest;
}

function validateTitle(pullRequest) {
  const releasePattern = core.getInput("release_pattern", { required: true });
  core.info(`Validating title with pattern [${releasePattern}]..`);

  const regExp = new RegExp(releasePattern);
  const match = regExp.exec(pullRequest.title);
  if (!match) {
    throw new ValidationError("Invalid release title.");
  }

  // Calver validation
  const { year, month, day } = match.groups || {};
  const today = new Date();

  if (
    releasePattern.includes("<year>") &&
    today.getUTCFullYear() !== Number(year)
  ) {
    throw new ValidationError(
      `${year} is not a valid year. Current is ${today.getUTCFullYear()}.`
    );
  }
  if (
    releasePattern.includes("<month>") &&
    today.getUTCMonth() + 1 !== Number(month)
  ) {
    throw new ValidationError(
      `${month} is not a valid month. Current is ${today.getUTCMonth() + 1}.`
    );
  }
  if (releasePattern.includes("<day>") && today.getUTCDate() !== Number(day)) {
    throw new ValidationError(
      `${day} is not a valid day. Current is ${today.getUTCDate()}.`
    );
  }
}

function validateBody(pullRequest) {
  core.info("Validating body..");
  const { body } = pullRequest;
  if (!body) {
    throw new ValidationError("Missing description.");
  }
}

function validateBranches(pullRequest) {
  core.info("Validating branches..");
  const expectedBase = core.getInput("base_branch", { required: true });
  const expectedHead = core.getInput("head_branch", { required: true });
  const base = pullRequest.base.ref;
  const head = pullRequest.head.ref;

  if (base !== expectedBase) {
    throw new ValidationError(
      `Releases can only be made against ${expectedBase}. Check your action configuration.`
    );
  }
  if (head !== expectedHead) {
    throw new ValidationError(
      `Releases can only be made from ${expectedHead}. Got ${head}.`
    );
  }
}

async function validateRelease(pullRequest) {
  core.info("Validating release..");
  const tag = getTagName(pullRequest);
  try {
    await client.repos.getReleaseByTag({
      tag: tag,
      ...github.context.repo
    });
  } catch (error) {
    if (error.status === 404) {
      return;
    } else {
      throw error;
    }
  }
  throw new ValidationError("Release tag already exists.");
}

function getTagName(pullRequest) {
  const { title } = pullRequest;
  const tagPrefix = core.getInput("tag_prefix", { required: true });
  return tagPrefix + title;
}

async function addLabel(pullRequest) {
  const releaseLabel = core.getInput("release_label", { required: false });
  if (!releaseLabel) {
    return;
  }
  core.info("Adding label..");
  if (pullRequest.labels && pullRequest.labels.includes(releaseLabel)) {
    return;
  }
  // TODO: Handle missing label?
  await client.issues.addLabels({
    issue_number: pullRequest.number,
    labels: [releaseLabel],
    ...github.context.repo
  });
}

function getReviewApproveEvent() {
  const approveReleases = JSON.parse(
    core.getInput("approve_releases", { required: true })
  );
  return approveReleases ? REVIEW_APPROVE : REVIEW_COMMENT;
}

function getReviewFailEvent() {
  const approveReleases = JSON.parse(
    core.getInput("approve_releases", { required: true })
  );
  return approveReleases ? REVIEW_REQUEST_CHANGES : REVIEW_COMMENT;
}

const REVIEW_APPROVE = "APPROVE";
const REVIEW_COMMENT = "COMMENT";
const REVIEW_REQUEST_CHANGES = "REQUEST_CHANGES";

async function review(pullRequest, event, comment) {
  core.info("Reviewing..");
  await client.pulls.createReview({
    pull_number: pullRequest.number,
    body: comment,
    event: event,
    ...github.context.repo
  });
}

async function release(pullRequest) {
  core.info("Releasing..");
  const tag = getTagName(pullRequest);
  await client.repos.createRelease({
    name: pullRequest.title,
    tag_name: tag,
    body: pullRequest.body,
    prerelease: false,
    draft: false,
    target_commitish: pullRequest.merge_commit_sha,
    ...github.context.repo
  });
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

module.exports = {
  action,
  validate,
  validateTitle,
  validateBody,
  validateBranches,
  validateRelease,
  getTagName,
  getReviewApproveEvent,
  getReviewFailEvent,
  addLabel,
  review,
  release,
  ValidationError
};
