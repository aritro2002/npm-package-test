# Jenkins pipelines

| File | Purpose |
| --- | --- |
| `build.Jenkinsfile` | Original single-package pipeline, hardcoded to `npm-package-test`. Kept as reference. |
| `publish.Jenkinsfile` | Multi-repo, multi-package npm publish pipeline. |

## publish.Jenkinsfile

Publishes one or more npm packages from a chosen repository at a chosen git tag.

### Parameters

| Parameter | Default | Description |
| --- | --- | --- |
| `REPOSITORY` | `aritro2002/npm-multi-package` | Repo to publish from. Changing it reloads `TAG`. |
| `TAG` | *(newest)* | Git tag, listed newest first **for the selected repository**. |
| `NPM_TOKEN` | *(empty)* | npm token. Blank falls back to the credential, then the agent env. |
| `DRY_RUN` | **`true`** | Runs `npm publish --dry-run`. **Uncheck to actually publish.** |
| `SKIP_TESTS` | `false` | Skip the test stage. |

`DRY_RUN` defaults to on deliberately: `npm publish` cannot be undone (npm
only allows unpublish within 72 hours, under conditions), so publishing is
opt-in rather than the result of a mis-click.

Everything else is fixed in the Jenkinsfile rather than asked per build:
the registry is `https://registry.npmjs.org/`, the dist-tag is `latest`, and
every publishable package found at the tag is published.

### The TAG dropdown

`TAG` is an Active Choices **reactive** parameter: it re-runs
`git ls-remote --tags` against whichever `REPOSITORY` is selected and
repopulates itself, so you only ever see tags that actually exist there.

Tags are ordered newest first. Numeric components are zero-padded before
comparison, so `v0.133.0` ranks above `v0.99.0` above `v0.9.0` rather than
sorting lexicographically. Tags that do not start with a number (for example
`test-2025.06.30.01`) are pushed below real releases. The field is filterable,
which matters for hyperswitch-web -- it currently has 985 tags.

If the remote cannot be reached the dropdown shows a bracketed placeholder
such as `-- could not reach ... --`; the pipeline rejects those rather than
trying to check one out.

### Token resolution

Checked in order, first hit wins:

1. the `NPM_TOKEN` build parameter,
2. a Jenkins **Secret text** credential with ID `npm-token`,
3. `NPM_TOKEN` from the agent environment.

If none is present the build fails with that list. The token is written to a
workspace-local `.npmrc` (via `NPM_CONFIG_USERCONFIG`) and deleted in `post`.
It is never written to `~/.npmrc`, which would outlive the build and leak the
token to every other job on the agent.

### How packages are discovered

The pipeline does not hardcode a package list. After checkout it reads the
tree:

1. npm/yarn `workspaces` globs from the root `package.json` (handles the
   scoped `packages/@scope/*` form), else
2. a scan of `packages/*` and `packages/*/*`,
3. plus the repo root itself.

Anything marked `"private": true` is dropped. Discovery is scoped to declared
workspaces or `packages/`, so an unrelated `package.json` elsewhere in the repo
(a test harness, a demo app) cannot be published by accident.

Verified against the two configured repos:

```
aritro2002/npm-multi-package @ v0.1.0
  [public]  @aritro-tech/addition@0.1.0        packages/@aritro-tech/addition
  [public]  @aritro-tech/calculator@0.1.0      packages/@aritro-tech/calculator
  [public]  @aritro-tech/multiplication@0.1.0  packages/@aritro-tech/multiplication
  [public]  @aritro-tech/regex@0.1.0           packages/@aritro-tech/regex
  [public]  @aritro-tech/subtraction@0.1.0     packages/@aritro-tech/subtraction
  [private] @aritro-tech/example@0.0.0         example
  [private] npm-multi-package@1.0.0            .

juspay/hyperswitch-web @ v0.133.0
  [private] orca-payment-page@0.133.0          .
```

### hyperswitch-web is not currently publishable

Its root `package.json` is `"private": true` (`orca-payment-page`) and it
declares no workspaces. It is a webpack-built SDK bundle that ships to S3 via
`npm run deploy-to-s3`, not an npm package.

Selecting it therefore stops at the discovery stage with an explicit message
rather than a confusing `npm publish` failure. It is wired into `REPO_CONFIG`
(with submodule checkout enabled, since the repo uses a `shared-code`
submodule) so it works the moment it gains a publishable package.

### Stages

1. **Resolve target** — map the repo choice to a URL and options.
2. **Validate tag** — `git ls-remote`; on a miss, print the 20 most recent tags.
3. **Checkout** — the tag into `source/`, so pipeline files at the workspace
   root survive the clone. Submodules when the repo needs them.
4. **Discover packages** — as above; honours `PACKAGES` and fails on a typo.
5. **Install** — `npm ci` when a lockfile exists, else `npm install`.
6. **Build** / **Test** — skipped when the repo has no such script.
7. **Authenticate npm** — write the workspace-local `.npmrc`, then `npm whoami`
   (a warning rather than an error during a dry run).
8. **Publish** — per package, skipping any version already on the registry,
   since `npm publish` errors on a republish and would otherwise abort a
   multi-package run halfway through.

A summary of published / skipped / failed prints in `post`.

### Job setup

1. New Item → **Pipeline**.
2. Pipeline → **Pipeline script from SCM** → this repo → script path
   `jenkins/publish.Jenkinsfile`.
3. Add a **Secret text** credential with ID `npm-token` (optional; the
   parameter and agent env are the fallbacks).
4. Build with Parameters.

Required agent tooling: `git`, `node`, `npm`.

Plugins: **Pipeline**, **Git**, **Credentials Binding**, and
**Active Choices** (`uno-choice`).

Active Choices is required and has no core equivalent: a declarative
`parameters {}` block is static and cannot react to another parameter, so a
repository-dependent tag list is impossible without it. That is also why the
parameters are declared via `properties([parameters([...])])` in the first
stage rather than in a `parameters {}` block.

The pipeline deliberately avoids `timestamps()` (Timestamper plugin) and
`cleanWs()` (Workspace Cleanup plugin), using the core `deleteDir()` step
instead. The Git Parameter plugin is not used either: its `useRepository`
binding ties a job to one SCM, which is exactly what would stop a single job
from serving several repositories.

### Examples

Dry run of everything at a tag:

```
REPOSITORY = aritro2002/npm-multi-package
TAG        = v0.1.0
DRY_RUN    = true
```

Publish for real:

```
REPOSITORY = aritro2002/npm-multi-package
TAG        = v0.1.0
DRY_RUN    = false
```
