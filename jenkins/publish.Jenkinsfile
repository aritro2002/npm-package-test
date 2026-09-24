/*
 * Multi-repo, multi-package npm publish pipeline.
 *
 * Publishes one or more npm packages from a chosen repository at a chosen git
 * tag. Packages are discovered from the checked-out tree (npm/yarn workspaces,
 * or a packages/ scan) rather than hardcoded, so a repo that gains or loses a
 * package needs no pipeline change.
 *
 * Token resolution order: TOKEN parameter -> Jenkins credential -> agent env.
 */

// Add a repository here to make it selectable. `url` is the only required key.
REPO_CONFIG = [
    'aritro2002/npm-multi-package': [
        url       : 'https://github.com/aritro2002/npm-multi-package.git',
        submodules: false,
        buildTask : 'build',
        testTask  : 'test',
    ],
    'juspay/hyperswitch-web'      : [
        // NOTE: this repo's root package.json is currently `private: true`
        // (orca-payment-page) and declares no workspaces, so discovery will
        // find nothing publishable. The pipeline reports that and stops.
        url       : 'https://github.com/juspay/hyperswitch-web.git',
        submodules: true,
        buildTask : 'build',
        testTask  : '',
    ],
]

pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '30'))
        timeout(time: 45, unit: 'MINUTES')
    }

    parameters {
        choice(
            name: 'REPOSITORY',
            choices: ['aritro2002/npm-multi-package', 'juspay/hyperswitch-web', 'other'],
            description: 'Repository to publish from. Pick "other" to supply a URL in CUSTOM_REPO_URL.'
        )
        string(
            name: 'CUSTOM_REPO_URL',
            defaultValue: '',
            description: 'Clone URL, used only when REPOSITORY is "other". Example: https://github.com/org/repo.git'
        )
        string(
            name: 'TAG',
            defaultValue: '',
            description: 'Git tag to publish, e.g. v0.1.0. The build fails with a list of available tags if this does not exist.'
        )
        string(
            name: 'PACKAGES',
            defaultValue: 'all',
            description: 'Comma-separated package names to publish, or "all". Example: @aritro-tech/regex,@aritro-tech/addition'
        )
        password(
            name: 'NPM_TOKEN',
            defaultValue: '',
            description: 'npm automation token. Leave blank to use the "npm-token" Jenkins credential, then the agent NPM_TOKEN env var.'
        )
        string(
            name: 'NPM_DIST_TAG',
            defaultValue: 'latest',
            description: 'npm dist-tag to publish under (latest, next, beta...).'
        )
        string(
            name: 'REGISTRY',
            defaultValue: 'https://registry.npmjs.org/',
            description: 'Target npm registry.'
        )
        booleanParam(
            name: 'DRY_RUN',
            defaultValue: true,
            description: 'Runs npm publish --dry-run. UNCHECK THIS TO ACTUALLY PUBLISH. npm publish cannot be undone, so this defaults to on.'
        )
        booleanParam(
            name: 'SKIP_TESTS',
            defaultValue: false,
            description: 'Skip the test stage.'
        )
    }

    environment {
        // Checkout target, kept in a subdirectory so pipeline files at the
        // workspace root survive the clone.
        SRC = 'source'
        // Workspace-local npmrc. Never write to ~/.npmrc: it outlives the
        // build and leaks the token to every other job on the agent.
        NPM_CONFIG_USERCONFIG = "${WORKSPACE}/.npmrc-publish"
    }

    stages {

        stage('Resolve target') {
            steps {
                script {
                    def selected = params.REPOSITORY

                    if (selected == 'other') {
                        if (!params.CUSTOM_REPO_URL?.trim()) {
                            error('REPOSITORY is "other" but CUSTOM_REPO_URL is empty.')
                        }
                        env.REPO_URL = params.CUSTOM_REPO_URL.trim()
                        env.REPO_SUBMODULES = 'false'
                        env.BUILD_TASK = 'build'
                        env.TEST_TASK = 'test'
                    } else {
                        def cfg = REPO_CONFIG[selected]
                        if (!cfg) {
                            error("No configuration for repository '${selected}'.")
                        }
                        env.REPO_URL = cfg.url
                        env.REPO_SUBMODULES = cfg.submodules ? 'true' : 'false'
                        env.BUILD_TASK = cfg.buildTask ?: ''
                        env.TEST_TASK = cfg.testTask ?: ''
                    }

                    if (!params.TAG?.trim()) {
                        error('TAG is required.')
                    }
                    env.RESOLVED_TAG = params.TAG.trim()

                    currentBuild.displayName = "${selected} @ ${env.RESOLVED_TAG}${params.DRY_RUN ? ' (dry-run)' : ''}"

                    echo """
                    Repository : ${selected}
                    URL        : ${env.REPO_URL}
                    Tag        : ${env.RESOLVED_TAG}
                    Packages   : ${params.PACKAGES}
                    Registry   : ${params.REGISTRY}
                    Dist-tag   : ${params.NPM_DIST_TAG}
                    Dry run    : ${params.DRY_RUN}
                    """.stripIndent()
                }
            }
        }

        stage('Validate tag') {
            steps {
                sh '''
                    set -eu
                    if ! git ls-remote --tags --exit-code "$REPO_URL" "refs/tags/$RESOLVED_TAG" >/dev/null 2>&1; then
                        echo "Tag '$RESOLVED_TAG' does not exist in $REPO_URL"
                        echo ""
                        echo "Most recent tags:"
                        git ls-remote --tags --refs "$REPO_URL" \
                            | awk -F/ '{print $NF}' \
                            | sort -V \
                            | tail -20 \
                            | sed 's/^/  /'
                        exit 1
                    fi
                    echo "Tag '$RESOLVED_TAG' found."
                '''
            }
        }

        stage('Checkout') {
            steps {
                script {
                    def extensions = [
                        [$class: 'RelativeTargetDirectory', relativeTargetDir: env.SRC],
                        [$class: 'CloneOption', shallow: true, depth: 1, noTags: false, timeout: 20],
                    ]
                    if (env.REPO_SUBMODULES == 'true') {
                        extensions << [$class: 'SubmoduleOption', recursiveSubmodules: true, parentCredentials: true]
                    }

                    checkout([
                        $class           : 'GitSCM',
                        branches         : [[name: "refs/tags/${env.RESOLVED_TAG}"]],
                        extensions       : extensions,
                        userRemoteConfigs: [[url: env.REPO_URL]],
                    ])
                }

                sh '''
                    set -eu
                    cd "$SRC"
                    echo "Commit: $(git rev-parse HEAD)"
                    node --version
                    npm --version
                '''
            }
        }

        stage('Discover packages') {
            steps {
                script {
                    // Emitted as TSV rather than JSON so the Jenkins script
                    // sandbox does not need JSON-parsing approvals.
                    writeFile file: 'discover-packages.cjs', text: '''
const fs = require('fs');
const path = require('path');

const root = process.argv[2] || '.';
const rootPkgPath = path.join(root, 'package.json');

if (!fs.existsSync(rootPkgPath)) {
  process.stderr.write(`No package.json at ${root}\\n`);
  process.exit(0);
}

const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));

// Expand a workspace glob one path segment at a time. Handles the plain
// "packages/*" form and the scoped "packages/@scope/*" form alike.
function expand(pattern) {
  let current = [root];
  for (const part of pattern.split('/')) {
    const next = [];
    for (const base of current) {
      if (part === '*') {
        let entries = [];
        try {
          entries = fs.readdirSync(base, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name !== 'node_modules') {
            next.push(path.join(base, entry.name));
          }
        }
      } else {
        const candidate = path.join(base, part);
        if (fs.existsSync(candidate)) next.push(candidate);
      }
    }
    current = next;
  }
  return current;
}

const globs = Array.isArray(rootPkg.workspaces)
  ? rootPkg.workspaces
  : (rootPkg.workspaces && rootPkg.workspaces.packages) || [];

const dirs = new Set([root]);
for (const glob of globs) for (const dir of expand(glob)) dirs.add(dir);

// A repo may hold packages without declaring workspaces.
if (globs.length === 0) {
  for (const glob of ['packages/*', 'packages/*/*']) {
    for (const dir of expand(glob)) dirs.add(dir);
  }
}

const rows = [];
for (const dir of dirs) {
  const file = path.join(dir, 'package.json');
  if (!fs.existsSync(file)) continue;

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    process.stderr.write(`Skipping unparseable ${file}\\n`);
    continue;
  }

  if (!pkg.name || !pkg.version) continue;

  rows.push([
    pkg.name,
    pkg.version,
    path.relative(root, dir) || '.',
    pkg.private === true ? 'private' : 'public',
  ].join('\\t'));
}

rows.sort();
process.stdout.write(rows.join('\\n'));
'''.trim()

                    sh 'node discover-packages.cjs "$SRC" > discovered.tsv'

                    def raw = readFile('discovered.tsv').trim()
                    if (!raw) {
                        error("No package.json files found in ${params.REPOSITORY} at ${env.RESOLVED_TAG}.")
                    }

                    def all = []
                    raw.split('\n').each { line ->
                        def f = line.split('\t')
                        if (f.size() == 4) {
                            all << [name: f[0], version: f[1], dir: f[2], visibility: f[3]]
                        }
                    }

                    echo "Found ${all.size()} package.json file(s):"
                    all.each { p ->
                        echo "  ${p.visibility == 'private' ? '[private]' : '[public] '} ${p.name}@${p.version}  (${p.dir})"
                    }

                    def publishable = all.findAll { it.visibility == 'public' }
                    if (publishable.isEmpty()) {
                        error("""
                            Nothing publishable in ${params.REPOSITORY} at ${env.RESOLVED_TAG}.
                            Every package.json found is marked "private": true.
                            A private package is deliberately excluded from npm publish;
                            remove the private flag, or point this job at a repo that
                            publishes to npm.
                        """.stripIndent().trim())
                    }

                    // Honour an explicit selection, and fail loudly on a typo
                    // rather than silently publishing a different set.
                    def selected = publishable
                    if (params.PACKAGES?.trim() && params.PACKAGES.trim() != 'all') {
                        def wanted = params.PACKAGES.split(',').collect { it.trim() }.findAll { it }
                        def known = publishable.collect { it.name }
                        def unknown = wanted.findAll { !known.contains(it) }
                        if (unknown) {
                            error("Unknown package(s): ${unknown.join(', ')}\nPublishable here: ${known.join(', ')}")
                        }
                        selected = publishable.findAll { wanted.contains(it.name) }
                    }

                    env.SELECTED_PACKAGES = selected.collect { "${it.name}|${it.version}|${it.dir}" }.join('\n')
                    echo "\nSelected for publish (${selected.size()}):"
                    selected.each { echo "  ${it.name}@${it.version}" }
                }
            }
        }

        stage('Install dependencies') {
            steps {
                dir(env.SRC) {
                    sh '''
                        set -eu
                        if [ -f package-lock.json ]; then
                            npm ci
                        else
                            echo "No package-lock.json; falling back to npm install."
                            npm install --no-audit --no-fund
                        fi
                    '''
                }
            }
        }

        stage('Build') {
            when {
                expression { env.BUILD_TASK?.trim() }
            }
            steps {
                dir(env.SRC) {
                    sh '''
                        set -eu
                        if node -e 'const s=require("./package.json").scripts||{};process.exit(s[process.argv[1]]?0:1)' "$BUILD_TASK"; then
                            npm run "$BUILD_TASK"
                        else
                            echo "No '$BUILD_TASK' script defined; skipping build."
                        fi
                    '''
                }
            }
        }

        stage('Test') {
            when {
                allOf {
                    expression { !params.SKIP_TESTS }
                    expression { env.TEST_TASK?.trim() }
                }
            }
            steps {
                dir(env.SRC) {
                    sh '''
                        set -eu
                        if node -e 'const s=require("./package.json").scripts||{};process.exit(s[process.argv[1]]?0:1)' "$TEST_TASK"; then
                            npm run "$TEST_TASK"
                        else
                            echo "No '$TEST_TASK' script defined; skipping tests."
                        fi
                    '''
                }
            }
        }

        stage('Authenticate npm') {
            steps {
                script {
                    withNpmToken {
                        sh '''
                            set -eu
                            umask 077
                            registry_host=$(echo "$REGISTRY" | sed -E 's#^https?://##; s#/$##')
                            {
                                echo "registry=$REGISTRY"
                                echo "//$registry_host/:_authToken=$RESOLVED_NPM_TOKEN"
                            } > "$NPM_CONFIG_USERCONFIG"
                        '''
                        // A dry run should still work with a placeholder
                        // token, so only a real publish treats this as fatal.
                        def whoami = sh(
                            returnStatus: true,
                            script: 'npm whoami --registry "$REGISTRY"'
                        )
                        if (whoami != 0) {
                            if (params.DRY_RUN) {
                                echo 'WARNING: npm whoami failed. Continuing because this is a dry run.'
                            } else {
                                error("npm whoami failed against ${params.REGISTRY}. The token is missing, expired, or lacks access.")
                            }
                        }
                    }
                }
            }
        }

        stage('Publish') {
            steps {
                script {
                    def entries = env.SELECTED_PACKAGES.split('\n')
                    def published = []
                    def skipped = []
                    def failed = []

                    withNpmToken {
                        entries.each { entry ->
                            def parts = entry.split('\\|')
                            def name = parts[0]
                            def version = parts[1]
                            def relDir = parts[2]

                            echo "--- ${name}@${version} (${relDir}) ---"

                            // npm publish is not idempotent: republishing an
                            // existing version is a hard error, which would
                            // abort a multi-package run halfway through.
                            def exists = sh(
                                returnStatus: true,
                                script: """
                                    set -eu
                                    cd "\$SRC/${relDir}"
                                    npm view "${name}@${version}" version --registry "\$REGISTRY" >/dev/null 2>&1
                                """
                            ) == 0

                            if (exists) {
                                echo "Already on the registry; skipping."
                                skipped << "${name}@${version}"
                                return
                            }

                            def dryFlag = params.DRY_RUN ? '--dry-run' : ''
                            def status = sh(
                                returnStatus: true,
                                script: """
                                    set -eu
                                    cd "\$SRC/${relDir}"
                                    npm publish \
                                        --access public \
                                        --tag "\$NPM_DIST_TAG_VALUE" \
                                        --registry "\$REGISTRY" \
                                        ${dryFlag}
                                """
                            )

                            if (status == 0) {
                                published << "${name}@${version}"
                            } else {
                                failed << "${name}@${version}"
                                echo "FAILED to publish ${name}@${version} (exit ${status})"
                            }
                        }
                    }

                    env.SUMMARY_PUBLISHED = published.join(', ')
                    env.SUMMARY_SKIPPED = skipped.join(', ')
                    env.SUMMARY_FAILED = failed.join(', ')

                    if (failed) {
                        error("Failed to publish: ${failed.join(', ')}")
                    }
                }
            }
        }
    }

    post {
        always {
            // The token file must not survive the build.
            sh '''
                rm -f "$NPM_CONFIG_USERCONFIG" || true
                rm -f discover-packages.cjs discovered.tsv || true
            '''
            script {
                echo """
                ================ SUMMARY ================
                Repository : ${params.REPOSITORY}
                Tag        : ${params.TAG}
                Mode       : ${params.DRY_RUN ? 'DRY RUN (nothing was published)' : 'PUBLISHED'}
                Published  : ${env.SUMMARY_PUBLISHED ?: '-'}
                Skipped    : ${env.SUMMARY_SKIPPED ?: '-'}
                Failed     : ${env.SUMMARY_FAILED ?: '-'}
                =========================================
                """.stripIndent()
            }
        }
        cleanup {
            cleanWs()
        }
    }
}

/**
 * Resolves the npm token and runs `body` with it exposed as
 * RESOLVED_NPM_TOKEN. Order: TOKEN parameter, then the "npm-token" Jenkins
 * credential, then NPM_TOKEN from the agent environment.
 *
 * NPM_DIST_TAG_VALUE is bound here too so the publish shell can read the
 * dist-tag without Groovy interpolating it into the command string.
 */
def withNpmToken(Closure body) {
    def extraEnv = ["NPM_DIST_TAG_VALUE=${params.NPM_DIST_TAG}"]

    if (params.NPM_TOKEN?.trim()) {
        echo 'Using npm token from the build parameter.'
        withEnv(extraEnv + ["RESOLVED_NPM_TOKEN=${params.NPM_TOKEN}"]) {
            body()
        }
        return
    }

    def hasCredential = true
    try {
        withCredentials([string(credentialsId: 'npm-token', variable: 'PROBE')]) {
            // Presence check only; the value is not read here.
        }
    } catch (ignored) {
        hasCredential = false
    }

    if (hasCredential) {
        echo 'Using the "npm-token" Jenkins credential.'
        withEnv(extraEnv) {
            withCredentials([string(credentialsId: 'npm-token', variable: 'RESOLVED_NPM_TOKEN')]) {
                body()
            }
        }
        return
    }

    if (env.NPM_TOKEN?.trim()) {
        echo 'Using NPM_TOKEN from the agent environment.'
        withEnv(extraEnv + ["RESOLVED_NPM_TOKEN=${env.NPM_TOKEN}"]) {
            body()
        }
        return
    }

    error('''
        No npm token available. Provide one of:
          1. the NPM_TOKEN build parameter,
          2. a Jenkins "Secret text" credential with ID "npm-token",
          3. an NPM_TOKEN environment variable on the agent.
    '''.stripIndent().trim())
}
