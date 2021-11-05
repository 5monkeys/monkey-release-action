const nock = require("nock");
const moment = require("moment");
const path = require("path");

const owner = "someowner";
const repo = "somerepo";

beforeEach(() => {
  process.env["INPUT_REPO_TOKEN"] = "hunter2";
  process.env["GITHUB_REPOSITORY"] = `${owner}/${repo}`;
  process.env["INPUT_TAG_TRANSFORMER"] = "title";
});

test("validate", async () => {
  const { validate } = require("./action");
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
    .reply(404);

  const validatedPR = await validate(pullRequest);
  expect(validatedPR).toBe(pullRequest);
  await expect(validate({ ...pullRequest, title: "badtitle" })).rejects.toThrow(
    /Invalid release title/
  );
});

test("validateSkipping", async () => {
  const { validate } = require("./action");
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
  const pullRequest = {
    number: prNumber,
    title: currentDate,
    body: "mybody",
    labels: [],
    base: { ref: "master" },
    head: { ref: "dev", sha: headSha },
    validate: false,
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
    .reply(404);

  const validatedPR = await validate(pullRequest);
  expect(validatedPR).toBe(pullRequest);
  await expect(validate({ ...pullRequest, title: "badtitle" })).rejects.toThrow(
    /Invalid release title/
  );
});

test("getReviewApproveEvent", () => {
  const { getReviewApproveEvent } = require("./action");

  process.env["INPUT_APPROVE_RELEASES"] = "true";
  expect(getReviewApproveEvent()).toBe("APPROVE");
  process.env["INPUT_APPROVE_RELEASES"] = "false";
  expect(getReviewApproveEvent()).toBe("COMMENT");
});

test("getReviewFailEvent", () => {
  const { getReviewFailEvent } = require("./action");

  process.env["INPUT_APPROVE_RELEASES"] = "true";
  expect(getReviewFailEvent()).toBe("REQUEST_CHANGES");
  process.env["INPUT_APPROVE_RELEASES"] = "false";
  expect(getReviewFailEvent()).toBe("COMMENT");
});

test("getTagName", () => {
  const { getTagName } = require("./action");

  process.env["INPUT_TAG_PREFIX"] = "release/";
  expect(getTagName({ title: "hejhej", number: 32 })).toBe("release/hejhej");

  process.env["INPUT_TAG_TRANSFORMER"] = "dashes-and-number";
  expect(getTagName({ title: "This is a PR", number: 32 })).toBe(
    "release/#32-this-is-a-pr"
  );

  process.env["INPUT_TAG_TRANSFORMER"] = "dashes-and-number";
  expect(getTagName({ title: " This is a PR ", number: 32 })).toBe(
    "release/#32-this-is-a-pr"
  );
});

test("getTagName errors for bad transformers", () => {
  const { getTagName } = require("./action");

  process.env["INPUT_TAG_PREFIX"] = "release/";
  process.env["INPUT_TAG_TRANSFORMER"] = "bad transformer";
  expect(() => getTagName({ title: "hejhej", number: 32 })).toThrow(
    /Invalid transformer: bad transformer/
  );
});

test("addLabel", async () => {
  const { addLabel } = require("./action");
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
  const { review } = require("./action");

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
  const { release } = require("./action");

  process.env["INPUT_TAG_PREFIX"] = "release/";
  nock("https://api.github.com")
    .post(`/repos/${owner}/${repo}/releases`)
    .reply(200);
  await release({
    title: "hejhej",
    body: "somebody",
    merge_commit_sha: "deadbeef",
  });

  // Test integration of body generation
  process.env["INPUT_GENERATE_BODY"] = "true";
  nock("https://api.github.com")
    .post(`/repos/${owner}/${repo}/releases/generate-notes`)
    .reply(200, '{"name": "flufftitle","body": "mybody"}');
  nock("https://api.github.com")
    .post(`/repos/${owner}/${repo}/releases`)
    .reply(200);
  await release({
    title: "hejhej",
    body: "",
    merge_commit_sha: "deadbeef",
  });
});

test("validateTitle", () => {
  const { validateTitle } = require("./action");

  process.env["INPUT_RELEASE_PATTERN"] =
    "^(?<year>[0-9]{4})\\.(?<month>[0-9]{2})\\.(?<day>[0-9]{2})-\\d$";

  // Valid
  const currentDate = moment.utc(new Date()).format("YYYY.MM.DD-1");
  validateTitle({ title: currentDate });

  // Invalid
  expect(() => {
    validateTitle({ title: "IAMINVALID" });
  }).toThrow(/Invalid release title/);

  // Invalid year
  expect(() => {
    validateTitle({ title: "2001.09.28-1" });
  }).toThrow(/is not a valid year/);

  // Invalid month
  const invalidMonth = moment.utc(new Date()).format("YYYY.13.DD-1");
  expect(() => {
    validateTitle({ title: invalidMonth });
  }).toThrow(/is not a valid month/);

  // Invalid day
  const invalidDay = moment(new Date()).format("YYYY.MM.32-1");
  expect(() => {
    validateTitle({ title: invalidDay });
  }).toThrow(/is not a valid day/);

  // Only year
  process.env["INPUT_RELEASE_PATTERN"] = "^(?<year>[0-9]{4})\\-\\d$";
  validateTitle({ title: moment.utc(new Date()).format("YYYY-1") });
  expect(() => {
    validateTitle({ title: "2001-1" });
  }).toThrow(/is not a valid year/);

  // Only year and month
  process.env["INPUT_RELEASE_PATTERN"] =
    "^(?<year>[0-9]{4})\\.(?<month>[0-9]{2})\\-\\d$";
  validateTitle({ title: moment.utc(new Date()).format("YYYY.MM-1") });
  expect(() => {
    validateTitle({ title: moment.utc(new Date()).format("YYYY.13-1") });
  }).toThrow(/is not a valid month/);

  // Non Calver
  process.env["INPUT_RELEASE_PATTERN"] = "^release$";
  validateTitle({ title: "release" });
  expect(() => {
    validateTitle({ title: "IAMINVALID" });
  }).toThrow(/Invalid release title/);
});

test("validateBody", () => {
  const { validateBody } = require("./action");
  process.env["INPUT_GENERATE_BODY"] = "";

  // Valid body
  validateBody({ body: "A body" });

  // Invalid body
  expect(() => {
    validateBody({ title: null });
  }).toThrow(/Missing description/);

  process.env["INPUT_GENERATE_BODY"] = "true";

  // Invalid body, but generate body is on
  validateBody({ title: null });

  // Reset generate body tag, to not break other tests
  process.env["INPUT_GENERATE_BODY"] = "";
});

test("validateBranches", () => {
  const { validateBranches } = require("./action");

  process.env["INPUT_BASE_BRANCH"] = "master";
  process.env["INPUT_HEAD_BRANCH"] = "dev";

  // Valid branch
  validateBranches({ base: { ref: "master" }, head: { ref: "dev" } });

  // Invalid head
  expect(() => {
    validateBranches({
      base: { ref: "master" },
      head: { ref: "someweirdbranch" },
    });
    approve_releases;
  }).toThrow(/Releases can only be made from/);

  // Invalid body
  expect(() => {
    validateBranches({
      base: { ref: "someweirdbranch" },
      head: { ref: "dev" },
    });
  }).toThrow(/Releases can only be made against/);
});

test("validateRelease", async () => {
  const { validateRelease } = require("./action");

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
  await expect(validateRelease({ title: "hejhej" })).rejects.toThrow(
    /Release tag already exists/
  );

  // Server error
  nock("https://api.github.com")
    .get(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`)
    .reply(500);
  await expect(validateRelease({ title: "hejhej" })).rejects.toThrow(Error);
});

test("setStatus", async () => {
  const { setStatus } = require("./action");

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

test("generateBody", async () => {
  const { generateBody } = require("./action");

  process.env["INPUT_TAG_PREFIX"] = "release/";

  pr = {
    title: "hejhej",
    body: "",
    merge_commit_sha: "deadbeef",
  };

  nock("https://api.github.com")
    .post(`/repos/${owner}/${repo}/releases/generate-notes`)
    .reply(200, JSON.parse('{"name": "flufftitle","body": "mybody"}'));
  await generateBody(pr);
  expect(pr.body).toBe("mybody");
});
