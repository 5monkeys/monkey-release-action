module.exports =
/******/ (function(modules, runtime) { // webpackBootstrap
/******/ 	"use strict";
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete installedModules[moduleId];
/******/ 		}
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	__webpack_require__.ab = __dirname + "/";
/******/
/******/ 	// the startup function
/******/ 	function startup() {
/******/ 		// Load entry module and return exports
/******/ 		return __webpack_require__(982);
/******/ 	};
/******/
/******/ 	// run startup
/******/ 	return startup();
/******/ })
/************************************************************************/
/******/ ({

/***/ 22:
/***/ (function(module) {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 182:
/***/ (function(module, __unusedexports, __webpack_require__) {

const core = __webpack_require__(22);
const github = __webpack_require__(907);

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

async function validate(pullRequest) {
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
  // Approve Release
  await review(pullRequest, getReviewApproveEvent(), "Valid release.");
  return pullRequest;
}

function validateTitle(pullRequest) {
  const releasePattern = core.getInput("release_pattern", { required: true });
  core.info(
    `Validating title ${pullRequest.title} against pattern ${releasePattern}`
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
    today.getUTCFullYear() !== Number(year)
  ) {
    throw new ValidationError(
      `${year} is not a valid year. Current is ${today.getUTCFullYear()}.`
    );
  }

  // Check month
  if (
    releasePattern.includes("<month>") &&
    today.getUTCMonth() + 1 !== Number(month)
  ) {
    throw new ValidationError(
      `${month} is not a valid month. Current is ${today.getUTCMonth() + 1}.`
    );
  }

  // Check day
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
  if (expectedHead !== "*" && head !== expectedHead) {
    throw new ValidationError(
      `Releases can only be made from ${expectedHead}. Got ${head}.`
    );
  }
}

async function validateRelease(pullRequest) {
  core.info("Validating release..");
  const tag = getTagName(pullRequest);
  // Check that current release tag returns 404 to ensure no duplicate releases
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
  // Add label is it is not already present on PR
  core.info(`Adding label ${releaseLabel}..`);
  if (pullRequest.labels && pullRequest.labels.includes(releaseLabel)) {
    return;
  }
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
  core.info(`Reviewing ${pullRequest.number}..`);
  await client.pulls.createReview({
    pull_number: pullRequest.number,
    body: comment,
    event: event,
    ...github.context.repo
  });
  // Set status on commit
  await setStatus(
    pullRequest,
    event === REVIEW_APPROVE ? STATUS_SUCCESS : STATUS_FAILURE,
    comment
  );
}

const STATUS_FAILURE = "failure";
const STATUS_SUCCESS = "success";

async function setStatus(pullRequest, state, description) {
  core.info(`Setting status ${state}..`);
  const createStatus = JSON.parse(
    core.getInput("create_status", { required: true })
  );

  if (!createStatus) {
    return;
  }
  const context = core.getInput("status_name", { required: true });
  await client.repos.createStatus({
    state,
    description,
    context,
    sha: pullRequest.head.sha,
    ...github.context.repo
  });
}

async function release(pullRequest) {
  core.info(`Releasing ${pullRequest.merge_commit_sha}..`);
  const tag = getTagName(pullRequest);
  const isPrerelease =
    JSON.parse(core.getInput("prerelease") || false) === true;

  core.info(`Is prerelease? ${isPrerelease}`);
  await client.repos.createRelease({
    name: pullRequest.title,
    tag_name: tag,
    body: pullRequest.body,
    prerelease: isPrerelease,
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
  setStatus,
  ValidationError
};


/***/ }),

/***/ 907:
/***/ (function(module) {

module.exports = eval("require")("@actions/github");


/***/ }),

/***/ 982:
/***/ (function(__unusedmodule, __unusedexports, __webpack_require__) {

const core = __webpack_require__(22);
const { action } = __webpack_require__(182);

action().catch(error => {
  // Action threw an error. Fail the action with the error message.
  core.setFailed(error.message);
});


/***/ })

/******/ });