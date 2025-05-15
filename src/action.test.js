import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import nock from "nock";
import moment from "moment";

const owner = "someowner";
const repo = "somerepo";

beforeEach(() => {
  nock.cleanAll();
  process.env["INPUT_REPO_TOKEN"] = "hunter2";
  process.env["GITHUB_REPOSITORY"] = `${owner}/${repo}`;
  process.env["INPUT_TAG_TRANSFORMER"] = "title";
});

test("validate", async () => {
  const { validate, ValidationError } = await import("./action.js");

  process.env["INPUT_APPROVE_RELEASES"] = "true";
  process.env["INPUT_RELEASE_PATTERN"] =
    "^(?<year>[0-9]{4})\\.(?<month>[0-9]{2})\\.(?<day>[0-9]{2})-\\d$";
  process.env["INPUT_BASE_BRANCH"] = "master";
  process.env["INPUT_HEAD_BRANCH"] = "dev";
  process.env["INPUT_RELEASE_LABEL"] = "Release";
  process.env["INPUT_TAG_PREFIX"] = "release/";
  process.env["INPUT_CREATE_STATUS"] = "true";
  process.env["INPUT_STATUS_NAME"] = "Monkey Release";
  const currentDate = moment.utc(new Date()).format("YYYY.MM.DD-1");
  const prNumber = "1";
  const tag = `release/${currentDate}`;
  const headSha = "deadbeef";
  const ciUser = "our-ci-user";
  const pullRequest = {
    number: prNumber,
    title: currentDate,
    body: "mybody",
    labels: [],
    base: { ref: "master" },
    head: { ref: "dev", sha: headSha },
  };
  nock("https://api.github.com")
    .persist()
    .post(`/repos/${owner}/${repo}/issues/${prNumber}/labels`)
    .reply(200)
    .post(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`)
    .reply(200)
    .post(`/repos/${owner}/${repo}/statuses/${headSha}`)
    .reply(200)
    .get(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`)
    .reply(404)
    .get(`/user`)
    .reply(200, { login: ciUser })
    .get(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`)
    .reply(200, [
      { user: { login: ciUser }, state: "CHANGES_REQUESTED" },
      { user: { login: "someone-else" }, state: "APPROVED" },
    ]);

  const validatedPR = await validate(pullRequest);
  assert.equal(validatedPR, pullRequest);
  await assert.rejects(
    validate({ ...pullRequest, title: "badtitle" }),
    ValidationError,
    /Invalid release title/
  );
});

test("validateSkipping", async () => {
  const { validate, ValidationError } = await import("./action.js");
  process.env["INPUT_APPROVE_RELEASES"] = "true";
  process.env["INPUT_RELEASE_PATTERN"] =
    "^(?<year>[0-9]{4})\\.(?<month>[0-9]{2})\\.(?<day>[0-9]{2})-\\d$";
  process.env["INPUT_BASE_BRANCH"] = "master";
  process.env["INPUT_HEAD_BRANCH"] = "dev";
  process.env["INPUT_RELEASE_LABEL"] = "Release";
  process.env["INPUT_TAG_PREFIX"] = "release/";
  process.env["INPUT_CREATE_STATUS"] = "true";
  process.env["INPUT_STATUS_NAME"] = "Monkey Release";
  const currentDate = moment.utc(new Date()).format("YYYY.MM.DD-1");
  const prNumber = "1";
  const tag = `release/${currentDate}`;
  const headSha = "deadbeef";
  const ciUser = "our-ci-user";
  const pullRequest = {
    number: prNumber,
    title: currentDate,
    body: "mybody",
    labels: [],
    base: { ref: "master" },
    head: { ref: "dev", sha: headSha },
    validate: false,
  };
  const scope = nock("https://api.github.com")
    .persist()
    .post(`/repos/${owner}/${repo}/issues/${prNumber}/labels`)
    .reply(200)
    .post(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`)
    .reply(200)
    .post(`/repos/${owner}/${repo}/statuses/${headSha}`)
    .reply(200)
    .get(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`)
    .reply(404)
    .get(`/user`)
    .reply(200, { login: ciUser })
    .get(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`)
    .reply(200, [
      { user: { login: ciUser }, state: "CHANGES_REQUESTED" },
      { user: { login: "someone-else" }, state: "APPROVED" },
    ]);

  const validatedPR = await validate(pullRequest);
  assert.equal(validatedPR, pullRequest);
  await assert.rejects(
    validate({ ...pullRequest, title: "badtitle" }),
    ValidationError
  );
  scope.done();
});

test("getReviewApproveEvent", async () => {
  const { getReviewApproveEvent } = await import("./action.js");

  process.env["INPUT_APPROVE_RELEASES"] = "true";
  assert.equal(getReviewApproveEvent(), "APPROVE");
  process.env["INPUT_APPROVE_RELEASES"] = "false";
  assert.equal(getReviewApproveEvent(), "COMMENT");
});

test("getReviewFailEvent", async () => {
  const { getReviewFailEvent } = await import("./action.js");

  process.env["INPUT_APPROVE_RELEASES"] = "true";
  assert.equal(getReviewFailEvent(), "REQUEST_CHANGES");
  process.env["INPUT_APPROVE_RELEASES"] = "false";
  assert.equal(getReviewFailEvent(), "COMMENT");
});

test("hasPreviouslyApproved", async () => {
  const { hasPreviouslyApproved } = await import("./action.js");
  const prNumber = "1";
  const ciUser = "our-ci-user";
  const pullRequest = { number: prNumber };
  const scope = nock("https://api.github.com")
    .get(`/user`)
    .reply(200, { login: ciUser })
    .get(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`)
    .reply(200, [
      { user: { login: ciUser }, state: "CHANGES_REQUESTED" },
      { user: { login: "someone-else" }, state: "APPROVED" },
    ]);

  assert(!(await hasPreviouslyApproved(pullRequest)));
  scope.done();

  const nextScope = nock("https://api.github.com")
    .get(`/user`)
    .reply(200, { login: ciUser })
    .get(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`)
    .reply(200, [
      { user: { login: ciUser }, state: "CHANGES_REQUESTED" },
      { user: { login: "someone-else" }, state: "APPROVED" },
      { user: { login: ciUser }, state: "APPROVED" },
    ]);

  assert(await hasPreviouslyApproved(pullRequest));
  nextScope.done();
});

test("getTagName", async () => {
  const { getTagName } = await import("./action.js");

  process.env["INPUT_TAG_PREFIX"] = "";
  assert.equal(getTagName({ title: "hejhej", number: 32 }), "hejhej");

  process.env["INPUT_TAG_PREFIX"] = "release/";
  assert.equal(getTagName({ title: "hejhej", number: 32 }), "release/hejhej");

  process.env["INPUT_TAG_TRANSFORMER"] = "dashes-and-number";
  assert.equal(
    getTagName({ title: "This is a PR---", number: 32 }),
    "release/#32-this-is-a-pr"
  );

  process.env["INPUT_TAG_TRANSFORMER"] = "dashes-and-number";
  assert.equal(
    getTagName({ title: " This is a PR ", number: 32 }),
    "release/#32-this-is-a-pr"
  );
});

test("getTagName errors for bad transformers", async () => {
  const { getTagName } = await import("./action.js");

  process.env["INPUT_TAG_PREFIX"] = "release/";
  process.env["INPUT_TAG_TRANSFORMER"] = "bad transformer";
  assert.throws(
    () => getTagName({ title: "hejhej", number: 32 }),
    /Invalid transformer: bad transformer/
  );
});

test("addLabel", async () => {
  const { addLabel } = await import("./action.js");
  const releaseLabel = "Release";
  process.env["INPUT_RELEASE_LABEL"] = releaseLabel;
  const prNumber = "5";
  const scope = nock("https://api.github.com")
    .post(`/repos/${owner}/${repo}/issues/${prNumber}/labels`)
    .reply(200);
  await addLabel({ number: prNumber, labels: [] });
  scope.done();
  // Test already existing label
  await addLabel({ number: prNumber, labels: [releaseLabel] });
  // Test non-existing label
  process.env["INPUT_RELEASE_LABEL"] = "";
  await addLabel({ number: prNumber });
});

test("review", async () => {
  const { review } = await import("./action.js");

  process.env["INPUT_CREATE_STATUS"] = "true";
  process.env["INPUT_STATUS_NAME"] = "Monkey Release";
  const prNumber = "5";
  const headSha = "deadbeef";
  nock("https://api.github.com")
    .post(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`)
    .reply(200)
    .post(`/repos/${owner}/${repo}/statuses/${headSha}`)
    .reply(200);
  await review({ number: prNumber, head: { sha: headSha } }, "APPROVE", "LGTM");
});

test("release", async () => {
  const { release } = await import("./action.js");

  process.env["INPUT_TAG_PREFIX"] = "release/";
  nock("https://api.github.com")
    .post(`/repos/${owner}/${repo}/releases`)
    .reply(200);
  await release({
    title: "hejhej",
    body: "somebody",
    merge_commit_sha: "deadbeef",
  });
});

test("validateTitle", async () => {
  const { validateTitle } = await import("./action.js");

  process.env["INPUT_RELEASE_PATTERN"] =
    "^(?<year>[0-9]{4})\\.(?<month>[0-9]{2})\\.(?<day>[0-9]{2})-\\d$";

  // Valid
  const currentDate = moment.utc(new Date()).format("YYYY.MM.DD-1");
  validateTitle({ title: currentDate });

  // Invalid
  assert.throws(() => {
    validateTitle({ title: "IAMINVALID" });
  }, /Invalid release title/);

  // Invalid year
  assert.throws(() => {
    validateTitle({ title: "2001.09.28-1" });
  }, /is not a valid year/);

  // Invalid month
  const invalidMonth = moment.utc(new Date()).format("YYYY.13.DD-1");
  assert.throws(() => {
    validateTitle({ title: invalidMonth });
  }, /is not a valid month/);

  // Invalid day
  const invalidDay = moment(new Date()).format("YYYY.MM.32-1");
  assert.throws(() => {
    validateTitle({ title: invalidDay });
  }, /is not a valid day/);

  // Only year
  process.env["INPUT_RELEASE_PATTERN"] = "^(?<year>[0-9]{4})\\-\\d$";
  validateTitle({ title: moment.utc(new Date()).format("YYYY-1") });
  assert.throws(() => {
    validateTitle({ title: "2001-1" });
  }, /is not a valid year/);

  // Only year and month
  process.env["INPUT_RELEASE_PATTERN"] =
    "^(?<year>[0-9]{4})\\.(?<month>[0-9]{2})\\-\\d$";
  validateTitle({ title: moment.utc(new Date()).format("YYYY.MM-1") });
  assert.throws(() => {
    validateTitle({ title: moment.utc(new Date()).format("YYYY.13-1") });
  }, /is not a valid month/);

  // Non Calver
  process.env["INPUT_RELEASE_PATTERN"] = "^release$";
  validateTitle({ title: "release" });
  assert.throws(() => {
    validateTitle({ title: "IAMINVALID" });
  }, /Invalid release title/);

  // Valid as short year
  process.env["INPUT_RELEASE_PATTERN"] =
    "^(?<year>[0-9]{2})\\.(?<month>[0-9]{2})\\.\\d$";
  validateTitle({ title: moment.utc(new Date()).format("YY.MM.1") });
  assert.throws(() => {
    validateTitle({ title: "20.12.1" });
  }, /is not a valid year/);
});

test("validateBody", async () => {
  const { validateBody } = await import("./action.js");

  // Valid body
  validateBody({ body: "A body" });

  // Invalid body
  assert.throws(() => {
    validateBody({ title: null });
  }, /Missing description/);
});

test("validateBranches", async () => {
  const { validateBranches } = await import("./action.js");

  process.env["INPUT_BASE_BRANCH"] = "master";
  process.env["INPUT_HEAD_BRANCH"] = "dev";

  // Valid branch
  validateBranches({ base: { ref: "master" }, head: { ref: "dev" } });

  // Invalid head
  assert.throws(() => {
    validateBranches({
      base: { ref: "master" },
      head: { ref: "someweirdbranch" },
    });
  }, /Releases can only be made from/);

  // Invalid body
  assert.throws(() => {
    validateBranches({
      base: { ref: "someweirdbranch" },
      head: { ref: "dev" },
    });
  }, /Releases can only be made against/);

  // Test wildcard
  process.env["INPUT_HEAD_BRANCH"] = "*";

  // Valid branch
  validateBranches({ base: { ref: "master" }, head: { ref: "dev" } });

  // Weird branch
  validateBranches({
    base: { ref: "master" },
    head: { ref: "someweirdbranch" },
  });

  process.env["INPUT_HEAD_BRANCH"] = "hotfix/*";

  // Valid branch
  validateBranches({
    base: { ref: "master" },
    head: { ref: "hotfix/monkey-business" },
  });

  // Invalid head
  assert.throws(() => {
    validateBranches({
      base: { ref: "master" },
      head: { ref: "someweirdbranch" },
    });
  }, /Releases can only be made from/);

  // Test multiple head branches
  process.env["INPUT_HEAD_BRANCH"] = ["dev", "hotfix/*"];

  // Valid branch
  validateBranches({ base: { ref: "master" }, head: { ref: "dev" } });
  validateBranches({
    base: { ref: "master" },
    head: { ref: "hotfix/monkey-business" },
  });

  // Invalid head
  assert.throws(() => {
    validateBranches({
      base: { ref: "master" },
      head: { ref: "someweirdbranch" },
    });
  }, /Releases can only be made from/);
});

test("validateRelease", async () => {
  const { validateRelease } = await import("./action.js");

  process.env["INPUT_TAG_PREFIX"] = "release/";

  const tag = "release/hejhej";

  // Valid non-existing release
  nock("https://api.github.com")
    .get(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`)
    .reply(404);
  await validateRelease({ title: "hejhej" });

  // Release already exists
  nock("https://api.github.com")
    .get(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`)
    .reply(200);
  await assert.rejects(
    validateRelease({ title: "hejhej" }),
    /Release tag already exists/
  );

  // Server error
  nock("https://api.github.com")
    .get(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`)
    .reply(500);
  await assert.rejects(validateRelease({ title: "hejhej" }), Error);
});

test("setStatus", async () => {
  const { setStatus } = await import("./action.js");

  process.env["INPUT_CREATE_STATUS"] = "true";
  process.env["INPUT_STATUS_NAME"] = "Monkey Release";
  const headSha = "deadbeef";
  nock("https://api.github.com")
    .post(`/repos/${owner}/${repo}/statuses/${headSha}`)
    .reply(200);
  await setStatus({ head: { sha: headSha } }, "success", "LGTM");
  process.env["INPUT_CREATE_STATUS"] = "false";
  await setStatus({ head: { sha: headSha } }, "success", "LGTM");
});
