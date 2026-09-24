# Jenkins pipelines

| File | Purpose |
| --- | --- |
| `build.Jenkinsfile` | Original single-package pipeline, hardcoded to `npm-package-test`. Kept as reference. |
| `publish.Jenkinsfile` | Multi-repo, multi-package npm publish pipeline. |
| `publish-hyperswitch.Jenkinsfile` | Publishes one Hyperswitch package, re-scoped to `@aritro2002`. |

---

## publish-hyperswitch.Jenkinsfile

Three parameters: **PACKAGE**, **TAG**, **NPM_TOKEN_INPUT**.

Pick a package; the TAG list reloads with that package's tags. The pipeline
checks the upstream Juspay repo out at that tag, builds, re-scopes and
publishes.

### Re-scoping

The upstream packages live under `@juspay-tech`, which we cannot publish to.
Before publishing, the pipeline rewrites the package's own `name`:

```
@juspay-tech/react-native-hyperswitch-scancard
        ->  @aritro2002/react-native-hyperswitch-scancard@0.2.2
```

and sets `publishConfig.access: public`, since a scoped package is restricted
by default.

**Dependencies are deliberately left alone.** They keep pointing at the real
`@juspay-tech` packages already on npm, so the republished package still
installs. Rewriting them would break it unless every dependency were
republished too.

### Packages and their tags

| Package | Repo | Tag scheme |
| --- | --- | --- |
| `hyper-js` | `juspay/hyper-js` | `v2.1.0` (repo-wide) |
| `react-hyper-js` | `juspay/react-hyper-js` | `v1.3.0` (repo-wide) |
| the 8 `react-native-hyperswitch*` packages | `juspay/react-native-hyperswitch` | `@juspay-tech/<name>@<version>` (per package) |

The monorepo uses Lerna independent versioning, so its tags are per package
rather than repo-wide. The TAG list filters to the selected package, matching
both the scoped form and the older unscoped one (`react-native-hyperswitch-click-to-pay@0.2.0`)
that a few early tags use. The trailing `@` anchors the match, so
`react-native-hyperswitch` does not swallow `react-native-hyperswitch-scancard`
tags.

Because those tag names contain `/` and `@`, refs are split on the literal
`refs/tags/` rather than on the last `/` -- the latter silently drops the
`@juspay-tech/` scope and yields a tag that does not exist.

**Two packages have no tags at all** upstream: `react-native-hyperswitch-payment-methods`
and `react-native-hyperswitch-paypal`. Selecting either shows
`-- no tags for ... --` and the build stops there.

### Notes

- `react-native-hyperswitch` is a **yarn 3** workspace; the two web repos use
  npm. The install stage picks by lockfile and falls back to `npm install` when
  yarn is not on the agent.
- There is no `DRY_RUN`. A re-run is still safe: the pipeline checks the
  registry first and skips a version that is already published, rather than
  failing on npm's republish error.

---

## publish.Jenkinsfile

## publish.Jenkinsfile

Publishes one or more npm packages from a chosen repository at a chosen git tag.

### Parameters

| Parameter | Default | Description |
| --- | --- | --- |
| `REPOSITORY` | `aritro2002/npm-multi-package` | Repo to publish from. Changing it reloads `TAG`. |
| `TAG` | *(newest)* | Git tag, listed newest first **for the selected repository**. |
| `NPM_TOKEN_INPUT` | *(empty)* | npm token. Blank falls back to the credential, then the agent env. |
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

1. the `NPM_TOKEN_INPUT` build parameter,
2. a Jenkins **Secret text** credential with ID `npm-token`,
3. `NPM_TOKEN` from the agent environment.

If none is present the build fails with that list. The token is written to a
workspace-local `.npmrc` (via `NPM_CONFIG_USERCONFIG`) and deleted in `post`.
It is never written to `~/.npmrc`, which would outlive the build and leak the
token to every other job on the agent.

The parameter is named `NPM_TOKEN_INPUT`, not `NPM_TOKEN`, so it cannot shadow
the agent-level `NPM_TOKEN` variable that is the third fallback. Its value is
read from the build environment rather than `params`, because a password
parameter surfaces through `params` as a `hudson.util.Secret` object with no
String methods.

**The token never passes through Groovy.** `withNpmToken` hands its closure the
*name* of the environment variable holding the token, not the value:
interpolating a secret into a step argument defeats Jenkins' log masking. The
shell that writes `.npmrc` runs `set +x` first and reads the value with
`printenv`, because Jenkins runs `sh` with tracing enabled and would otherwise
echo the token to the console in plaintext. Only the authenticate stage touches
the secret; publishing relies on the `.npmrc` already in force through
`NPM_CONFIG_USERCONFIG`.

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
  [public]  @aritro2002/addition@0.1.0        packages/@aritro2002/addition
  [public]  @aritro2002/calculator@0.1.0      packages/@aritro2002/calculator
  [public]  @aritro2002/multiplication@0.1.0  packages/@aritro2002/multiplication
  [public]  @aritro2002/regex@0.1.0           packages/@aritro2002/regex
  [public]  @aritro2002/subtraction@0.1.0     packages/@aritro2002/subtraction
  [private] @aritro2002/example@0.0.0         example
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
4. **Discover packages** — as above; every public package found is published.
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
