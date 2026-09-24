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
| `REPOSITORY` | `aritro2002/npm-multi-package` | Repo to publish from. Also `juspay/hyperswitch-web`, or `other`. |
| `CUSTOM_REPO_URL` | *(empty)* | Clone URL, used only when `REPOSITORY` is `other`. |
| `TAG` | *(empty)* | Git tag to publish, e.g. `v0.1.0`. Validated before checkout. |
| `PACKAGES` | `all` | Comma-separated package names, or `all`. |
| `NPM_TOKEN` | *(empty)* | npm token. Blank falls back to the credential, then the agent env. |
| `NPM_DIST_TAG` | `latest` | npm dist-tag (`latest`, `next`, `beta`…). |
| `REGISTRY` | `https://registry.npmjs.org/` | Target registry. |
| `DRY_RUN` | **`true`** | Runs `npm publish --dry-run`. **Uncheck to actually publish.** |
| `SKIP_TESTS` | `false` | Skip the test stage. |

`DRY_RUN` defaults to on deliberately: `npm publish` cannot be undone (npm
only allows unpublish within 72 hours, under conditions), so publishing is
opt-in rather than the result of a mis-click.

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

Required agent tooling: `git`, `node`, `npm`. Plugins: Pipeline, Git,
Credentials Binding, Timestamper, Workspace Cleanup. Unlike
`build.Jenkinsfile`, no Git Parameter plugin is needed — `TAG` is a validated
string, which is what allows one job to serve several repositories.

### Examples

Dry run of everything at a tag:

```
REPOSITORY = aritro2002/npm-multi-package
TAG        = v0.1.0
PACKAGES   = all
DRY_RUN    = true
```

Publish two packages for real, under a beta dist-tag:

```
REPOSITORY   = aritro2002/npm-multi-package
TAG          = v0.1.0
PACKAGES     = @aritro-tech/regex,@aritro-tech/addition
NPM_DIST_TAG = beta
DRY_RUN      = false
```
