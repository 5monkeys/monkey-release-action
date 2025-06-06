import core from "@actions/core";
import github from "@actions/github";

const client = new github.getOctokit(
  core.getInput("repo_token", { required: true }),
);

export async function action() {
  const action = github.context.payload.action;
  const pullRequest = github.context.payload.pull_request;
  if (pullRequest == null) {
    core.error("Found no pull request.");
    return;
  }
  const validateActions = ["opened", "edited", "reopened"];

  if (validateActions.includes(action)) {
    // Run validation for accepted actions
    core.info(`Validating pull request for action ${action}.`);
    await validate(pullRequest);
  } else if (action === "closed" && pullRequest.merged) {
    // Previously validated PR was merged so create release
    core.info(`Creating release.`);
    await release(pullRequest);
  } else {
    // Invalid action
    core.info(`Skipping since ${action} is not handled by this action.`);
    return;
  }
  core.info(`Finished running. Returning release ${pullRequest.title}`);
  // Set output to release name
  core.setOutput("release", pullRequest.title);
}

export async function validate(pullRequest) {
  const doValidate = JSON.parse(core.getInput("validate") || true) === true;

  if (!doValidate) {
    return pullRequest;
  }

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
      core.error(`Failed validation. Message: ${error.message}`);
      // Review if error is a ValidationError
      await review(pullRequest, getReviewFailEvent(), error.message);
    }
    throw error;
  }

  // Approve Release if our latest review wasn't an approval
  const approveEvent = getReviewApproveEvent();
  const shouldApproveAgain =
    approveEvent === REVIEW_APPROVE
      ? !(await hasPreviouslyApproved(pullRequest))
      : approveEvent === REVIEW_COMMENT;
  if (shouldApproveAgain) {
    await review(
      pullRequest,
      approveEvent,
      core.getInput("valid_release_message"),
    );
  }
  return pullRequest;
}

export function validateTitle(pullRequest) {
  const releasePattern = core.getInput("release_pattern", { required: true });
  core.info(
    `Validating title ${pullRequest.title} against pattern ${releasePattern}`,
  );

  // Run pull request title against defined pattern
  const regExp = new RegExp(releasePattern);
  const match = regExp.exec(pullRequest.title);
  if (!match) {
    throw new ValidationError("Invalid release title.");
  }

  // Calver validation
  const { year, month, day } = match.groups || {};
  const today = new Date();

  // Check year
  if (
    releasePattern.includes("<year>") &&
    today.getUTCFullYear() !== Number(year) &&
    Number(today.getUTCFullYear().toString().substr(-2)) !== Number(year)
  ) {
    throw new ValidationError(
      `${year} is not a valid year. Current is ${today.getUTCFullYear()}.`,
    );
  }

  // Check month
  if (
    releasePattern.includes("<month>") &&
    today.getUTCMonth() + 1 !== Number(month)
  ) {
    throw new ValidationError(
      `${month} is not a valid month. Current is ${today.getUTCMonth() + 1}.`,
    );
  }

  // Check day
  if (releasePattern.includes("<day>") && today.getUTCDate() !== Number(day)) {
    throw new ValidationError(
      `${day} is not a valid day. Current is ${today.getUTCDate()}.`,
    );
  }
}

export function validateBody(pullRequest) {
  core.info("Validating body..");
  const { body } = pullRequest;
  if (!body) {
    throw new ValidationError("Missing description.");
  }
}

/**
 * @param {string} pattern
 * @param {string} text
 * @returns {boolean}
 */
function testGlob(pattern, text) {
  const regexp = new RegExp(
    `^${pattern
      .split(",")
      .map((pattern) => `(${pattern.trim().replaceAll("*", ".*")})`)
      .join("|")}$`,
  );
  return regexp.test(text);
}

export function validateBranches(pullRequest) {
  core.info("Validating branches..");
  const expectedBase = core.getInput("base_branch", { required: true });
  const expectedHead = core.getInput("head_branch", { required: true });
  const base = pullRequest.base.ref;
  const head = pullRequest.head.ref;

  if (base !== expectedBase) {
    throw new ValidationError(
      `Releases can only be made against ${expectedBase}. Check your action configuration.`,
    );
  }

  if (!testGlob(expectedHead, head)) {
    throw new ValidationError(
      `Releases can only be made from ${expectedHead}. Got ${head}.`,
    );
  }
}

export async function validateRelease(pullRequest) {
  core.info("Validating release..");
  const tag = getTagName(pullRequest);
  // Check that current release tag returns 404 to ensure no duplicate releases
  try {
    await client.rest.repos.getReleaseByTag({
      tag: tag,
      ...github.context.repo,
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

const TRANSFORMERS = {
  "dashes-and-number": ({ title, number }) => {
    const name = title
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "")
      .replace(/-+$/g, "");
    return `#${number}-${name}`;
  },
  title: ({ title }) => title,
};

export function getTagName(pullRequest) {
  const tagPrefix = core.getInput("tag_prefix");
  const transformerName = core.getInput("tag_transformer");
  const transformer = TRANSFORMERS[transformerName || "title"];
  if (!transformer) {
    throw Error(`Invalid transformer: ${transformerName}`);
  }
  return (tagPrefix || "") + transformer(pullRequest);
}

export async function addLabel(pullRequest) {
  const releaseLabel = core.getInput("release_label", { required: false });
  if (!releaseLabel) {
    return;
  }
  // Add label is it is not already present on PR
  core.info(`Adding label ${releaseLabel}..`);
  if (pullRequest.labels && pullRequest.labels.includes(releaseLabel)) {
    return;
  }
  await client.rest.issues.addLabels({
    issue_number: pullRequest.number,
    labels: [releaseLabel],
    ...github.context.repo,
  });
}

export function getReviewApproveEvent() {
  const approveReleases = JSON.parse(
    core.getInput("approve_releases", { required: true }),
  );
  return approveReleases ? REVIEW_APPROVE : REVIEW_COMMENT;
}

export function getReviewFailEvent() {
  const approveReleases = JSON.parse(
    core.getInput("approve_releases", { required: true }),
  );
  return approveReleases ? REVIEW_REQUEST_CHANGES : REVIEW_COMMENT;
}

const REVIEW_APPROVE = "APPROVE";
const REVIEW_COMMENT = "COMMENT";
const REVIEW_REQUEST_CHANGES = "REQUEST_CHANGES";
const STATUS_FAILURE = "failure";
const STATUS_SUCCESS = "success";
const DESCRIPTION_SUCCESS = "Valid release.";
const DESCRIPTION_FAILURE = "Invalid release.";

export async function review(pullRequest, event, comment) {
  core.info(`Reviewing ${pullRequest.number}..`);
  await client.rest.pulls.createReview({
    pull_number: pullRequest.number,
    body: comment,
    event: event,
    ...github.context.repo,
  });
  // Set status on commit
  const state = event === REVIEW_APPROVE;
  await setStatus(
    pullRequest,
    state ? STATUS_SUCCESS : STATUS_FAILURE,
    state ? DESCRIPTION_SUCCESS : DESCRIPTION_FAILURE,
  );
}

export async function setStatus(pullRequest, state, description) {
  core.info(`Setting status ${state}..`);
  const createStatus = JSON.parse(
    core.getInput("create_status", { required: true }),
  );

  if (!createStatus) {
    return;
  }
  const context = core.getInput("status_name", { required: true });
  await client.rest.repos.createCommitStatus({
    state,
    description,
    context,
    sha: pullRequest.head.sha,
    ...github.context.repo,
  });
}

export async function release(pullRequest) {
  core.info(`Releasing ${pullRequest.merge_commit_sha}..`);
  const tag = getTagName(pullRequest);
  const isPrerelease =
    JSON.parse(core.getInput("prerelease") || false) === true;

  core.info(`Is prerelease? ${isPrerelease}`);
  await client.rest.repos.createRelease({
    name: pullRequest.title,
    tag_name: tag,
    body: pullRequest.body || "",
    prerelease: isPrerelease,
    draft: false,
    target_commitish: pullRequest.merge_commit_sha,
    ...github.context.repo,
  });
}

export async function hasPreviouslyApproved(pullRequest) {
  const userResponse = await client.rest.users.getAuthenticated();
  const response = await client.rest.pulls.listReviews({
    pull_number: pullRequest.number,
    ...github.context.repo,
  });
  const lastReview = response.data
    .filter((review) => review.user.login === userResponse.data.login)
    .pop();
  return lastReview ? lastReview.state === "APPROVED" : false;
}

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}
