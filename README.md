# Monkey Release Action

![](https://github.com/5monkeys/monkey-release-action/workflows/Test/badge.svg)

Validates a pull request intended for creating a [GitHub Release](https://developer.github.com/v3/repos/releases/#create-a-release). When merged the action will then create the release.

## The action flow

* Trigger on [PullRequestEvent](https://developer.github.com/v3/activity/events/types/#pullrequestevent) with type `opened`, `edited` or  `reopened`.
    * Add a label defined by `release_label` to the PR.
    * Validate title.
        * Checks that the PR title matches the defined `release_pattern`.
        * If `release_pattern` is a [Calver](https://www.google.com/search?client=safari&rls=en&q=Calver&ie=UTF-8&oe=UTF-8) containing named capture groups `<year>`, `<month>` and/or `<day>`
        it will check that the current date matches.
        * Check that a release with the same title does not already exist.
    * Validate that the PR body is not empty.
    * Validates that the PR is from an allowed branch defined by `head_branch`.
    * If above checks fails it will review the PR and request changes.
    * If above checks passes it will approve the PR.
* Trigger on [PullRequestEvent](https://developer.github.com/v3/activity/events/types/#pullrequestevent) with type `closed` and `merged`.
    * Create a [GitHub Release](https://developer.github.com/v3/repos/releases/#create-a-release) with the title and body of the PR. The release tag will be constructed as `tag_prefix`/`release`.


## Inputs

### `repo_token` **Required**

The GITHUB_TOKEN. See [details](https://help.github.com/en/articles/virtual-environments-for-github-actions#github_token-secret).

### `base_branch`

The branch which the release PR will target. Defaults to `master`.

### `head_branch`

The branch which the release PR originates from. Defaults to `dev`.

### `release_pattern`

The pattern to validate the PR title against. If it contains any of the named capture groups `<year>`, `<month>` and/or `<day>` Calver validation will occur to ensure that the date is current.

Make sure it validates against https://regexr.com.

Defaults to `^(?<year>[0-9]{4})\.(?<month>[0-9]{2})\.(?<day>[0-9]{2})-\d$`.

### `tag_prefix`

The prefix to use when tagging release. Set to null or an empty string to disable tag-prefixing. Defaults to `releases/`.

### `approve_releases`

Sets if a PR should just be commented upon or approved and request changes depending on the success of validation. Accepts `true` or `false`. Defaults to `true` .

### `release_label`

The label to add to the release PR. Set to an empty string to disable. Defaults to `release`.

### `prerelease`

Creates a prerelease instead. Defaults to `false`.

### `validate`

Validate name and description of PR according to provided input. Defaults to `true`.

### `create_status`

Sets if a [GitHub status](https://help.github.com/en/github/collaborating-with-issues-and-pull-requests/about-status-checks) should
be created by the action. This is useful when wanting to restrict merging until the action runs successfully. Since GitHub creates a
check on the PR for every PR event that triggers the action isn't useful to restrict merging by the action checks. Instead use this status specified by `status_name`.
Defaults to `true`.

### `status_name`

The name of the status created when `create_status` is set to `true`. Defaults to `Monkey Release`.

## Outputs

### `release`

The release title.

## Example usage

```yaml
on:
  pull_request:
    types: [opened, reopened, edited, closed]
    branches:
      - master
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: 5monkeys/monkey-release-action@master
        id: release
        with:
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          base_branch: master
          head_branch: dev
          tag_prefix: releases/
          approve_releases: true
          release_label: release
```

# Development

Install deps: `npm ci`

Run tests: `npm run test`

Run lint: `npm run lint`

Make sure `ncc` is installed: `npm i -g @zeit/ncc@0.22.3`.
Either run `make package` before commit or `make package-watch` whilst developing.

