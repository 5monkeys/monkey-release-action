# Monkey Release Action

Validates that PR has a valid title and body for creating a [GitHub Release](https://developer.github.com/v3/repos/releases/#create-a-release).

When this action is trigged on a [PullRequestEvent](https://developer.github.com/v3/activity/events/types/#pullrequestevent) with action `opened`, `edited` and  `reopened` validation will be ran.

When triggered on `closed` and the PullRequest is `merged` a [GitHub Release](https://developer.github.com/v3/repos/releases/#create-a-release) with the title and body of the PR will be created.


## Inputs

### `repo_token` **Required** 

The GITHUB_TOKEN.

### `base_branch`

The branch which the release PR will target. Defaults to `master`.

### `head_branch`

The branch which the release PR originates from. Defaults to `dev`.

### `release_pattern`

The pattern to validate the PR title against. If it contains any of the named capture groups `<year>`, `<month>` and/or `<day>` Calver validation will occur to ensure that the date is current.

Defaults to `/^(?<year>[0-9]{4})\.(?<month>[0-9]{2})\.(?<day>[0-9]{2})-\d$/`.

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
