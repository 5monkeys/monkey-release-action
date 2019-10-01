# Monkey Release Action

Validates that PR has a valid title and body for creating a [GitHub Release](https://developer.github.com/v3/repos/releases/#create-a-release).

When this action is trigged on a [PullRequestEvent](https://developer.github.com/v3/activity/events/types/#pullrequestevent) with type `opened`, `edited` or  `reopened` validation will be ran.

## The action flow

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
* When PR is merged into `base_branch` a [GitHub Release](https://developer.github.com/v3/repos/releases/#create-a-release) is created with the title and body of the PR. 


## Inputs

### `repo_token` **Required** 

The GITHUB_TOKEN.

### `base_branch`

The branch which the release PR will target. Defaults to `master`.

### `head_branch`

The branch which the release PR originates from. Defaults to `dev`.

### `release_pattern`

The pattern to validate the PR title against. If it contains any of the named capture groups `<year>`, `<month>` and/or `<day>` Calver validation will occur to ensure that the date is current.

Defaults to `^(?<year>[0-9]{4})\.(?<month>[0-9]{2})\.(?<day>[0-9]{2})-\d$`.

### `tag_prefix`

The prefix to use when tagging release. Set to null or an empty string to disable tag-prefixing. Defaults to `release/`.

### `approve_releases`

Sets if a PR should just be commented upon or approved and request changes depending on the success of validation. Accepts `true` or `false`. Defaults to `true` .

### `release_label`

The label to add to the release PR. Set to and empty string to disable. Defaults to `release`.

**Note**: Make sure that the label exists.

## Outputs

### `release`

The release title

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
      - uses: 5m/monkey-release@master
        id: release
        with:
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          base_branch: master
          head_branch: dev
          tag_prefix: release/
          approve_releases: true
          release_label: release
```
