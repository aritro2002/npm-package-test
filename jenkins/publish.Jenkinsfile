/*
 * Multi-repo, multi-package npm publish pipeline.
 *
 * Publishes every publishable npm package from a chosen repository at a chosen
 * git tag. Packages are discovered from the checked-out tree (npm/yarn
 * workspaces, or a packages/ scan) rather than hardcoded, so a repo that gains
 * or loses a package needs no pipeline change.
 *
 * TAG is an Active Choices reactive parameter: picking a REPOSITORY reloads the
 * tag list for that repository, newest first.
 *
 * REQUIRES the Active Choices plugin (uno-choice). Without it the Parameters
 * stage fails. See jenkins/README.md.
 *
 * Token resolution order: NPM_TOKEN parameter -> "npm-token" Jenkins
 * credential -> agent NPM_TOKEN environment variable.
 */

import groovy.transform.Field

// @Field rather than a bare assignment: a bare one becomes an implicit script
// field and Jenkins warns about leaks; a plain `def` would be a local of the
// generated run() method and invisible inside the pipeline closures.

// Add a repository here AND to REPO_CHOICES_SCRIPT / TAG_CHOICES_SCRIPT below.
@Field Map REPO_CONFIG = [
    'aritro2002/npm-multi-package': [
        url       : 'https://github.com/aritro2002/npm-multi-package.git',
        submodules: false,
        buildTask : 'build',
        testTask  : 'test',
    ],
    'juspay/hyperswitch-web'      : [
        // NOTE: this repo's root package.json is currently `private: true`
        // (orca-payment-page) and declares no workspaces, so discovery finds
        // nothing publishable. The pipeline reports that and stops.
        url       : 'https://github.com/juspay/hyperswitch-web.git',
        submodules: true,
        buildTask : 'build',
        testTask  : '',
    ],
]

// Active Choices scripts run on the controller in their own context and cannot
// see the globals above, so the repository list is repeated inside them.

@Field String REPO_CHOICES_SCRIPT = '''
return [
    'aritro2002/npm-multi-package',
    'juspay/hyperswitch-web',
]
'''

@Field String TAG_CHOICES_SCRIPT = '''
def urls = [
    'aritro2002/npm-multi-package': 'https://github.com/aritro2002/npm-multi-package.git',
    'juspay/hyperswitch-web'      : 'https://github.com/juspay/hyperswitch-web.git',
]

def url = urls[REPOSITORY]
if (!url) {
    return ['-- select a repository --']
}

try {
    def proc = ['git', 'ls-remote', '--tags', '--refs', url].execute()
    def stdout = new StringBuilder()
    def stderr = new StringBuilder()
    proc.consumeProcessOutput(stdout, stderr)
    proc.waitForOrKill(30000)

    if (proc.exitValue() != 0) {
        return ['-- could not reach ' + url + ' --']
    }

    def marker = 'refs/tags/'
    def tags = stdout.toString().readLines()
        .findAll { it.contains(marker) }
        .collect { it.substring(it.indexOf(marker) + marker.length()).trim() }
        .findAll { it }
        .unique()

    if (!tags) {
        return ['-- no tags in this repository --']
    }

    // Newest first. Numeric components are zero-padded so the comparison is
    // version-aware rather than lexicographic, which would put v0.9.0 above
    // v0.10.0. The leading '1'/'0' flag keeps non-version tags such as
    // 'test-2025.06.30.01' below real releases, since letters otherwise
    // outrank digits in a string comparison.
    def key = { tag ->
        def parts = tag.replaceFirst('^v', '').split('[._+-]')
        def numericFirst = parts && parts[0].isInteger() ? '1' : '0'
        numericFirst + parts.collect { part ->
            part.isInteger() ? part.padLeft(10, '0') : part
        }.join('.')
    }

    return tags.sort { a, b -> key(b) <=> key(a) }
} catch (failure) {
    return ['-- error listing tags: ' + failure.getMessage() + ' --']
}
'''

pipeline {
    agent any

    options {
        // buildDiscarder and disableConcurrentBuilds are job *properties*, so
        // they are set in the properties() call below. Setting them here too
        // would make the two calls fight over the same job config.
        timeout(time: 45, unit: 'MINUTES')
    }

    environment {
        // Checkout target, kept in a subdirectory so pipeline files at the
        // workspace root survive the clone.
        SRC = 'source'
        // Workspace-local npmrc. Never write to ~/.npmrc: it outlives the
        // build and leaks the token to every other job on the agent.
        NPM_CONFIG_USERCONFIG = "${WORKSPACE}/.npmrc-publish"
        REGISTRY = 'https://registry.npmjs.org/'
        NPM_DIST_TAG = 'latest'
    }

    stages {

        stage('Parameters') {
            steps {
                script {
                    // Active Choices parameters cannot be expressed in a
                    // declarative `parameters {}` block, so the whole parameter
                    // set is defined here. Changes take effect from the next
                    // build onwards.
                    properties([
                        buildDiscarder(logRotator(numToKeepStr: '30')),
                        disableConcurrentBuilds(),
                        parameters([
                            [$class             : 'ChoiceParameter',
                             name               : 'REPOSITORY',
                             description        : 'Repository to publish from. Changing this reloads the TAG list.',
                             choiceType         : 'PT_SINGLE_SELECT',
                             filterable         : false,
                             filterLength       : 1,
                             randomName         : 'choice-parameter-repository',
                             script             : [
                                 $class        : 'GroovyScript',
                                 fallbackScript: [classpath: [], sandbox: false, script: "return ['ERROR: could not load repository list']"],
                                 script        : [classpath: [], sandbox: false, script: REPO_CHOICES_SCRIPT],
                             ]],
                            [$class             : 'CascadeChoiceParameter',
                             name               : 'TAG',
                             description        : 'Git tag to publish, listed newest first for the repository selected above.',
                             choiceType         : 'PT_SINGLE_SELECT',
                             referencedParameters: 'REPOSITORY',
                             filterable         : true,
                             filterLength       : 1,
                             randomName         : 'choice-parameter-tag',
                             script             : [
                                 $class        : 'GroovyScript',
                                 fallbackScript: [classpath: [], sandbox: false, script: "return ['ERROR: could not list tags']"],
                                 script        : [classpath: [], sandbox: false, script: TAG_CHOICES_SCRIPT],
                             ]],
                            // No defaultValue: PasswordParameterDefinition does not
                            // accept one and Jenkins warns. Blank is the default anyway.
                            // Named _INPUT so it cannot collide with an agent-level
                            // NPM_TOKEN environment variable, which is the last fallback.
                            password(
                                name: 'NPM_TOKEN_INPUT',
                                description: 'npm automation token. Leave blank to use the "npm-token" Jenkins credential, then the agent NPM_TOKEN env var.'
                            ),
                            booleanParam(
                                name: 'DRY_RUN',
                                defaultValue: true,
                                description: 'Runs npm publish --dry-run. UNCHECK THIS TO ACTUALLY PUBLISH. npm publish cannot be undone, so this defaults to on.'
                            ),
                            booleanParam(
                                name: 'SKIP_TESTS',
                                defaultValue: false,
                                description: 'Skip the test stage.'
                            ),
                        ]),
                    ])

                    if (!params.REPOSITORY) {
                        error('''
                            Parameters have now been registered on this job.
                            This first run had none to work with, which is expected.
                            Re-run via "Build with Parameters" to publish.
                        '''.stripIndent().trim())
                    }
                }
            }
        }

        stage('Resolve target') {
            steps {
                script {
                    def cfg = REPO_CONFIG[params.REPOSITORY]
                    if (!cfg) {
                        error("No configuration for repository '${params.REPOSITORY}'.")
                    }

                    env.REPO_URL = cfg.url
                    env.REPO_SUBMODULES = cfg.submodules ? 'true' : 'false'
                    env.BUILD_TASK = cfg.buildTask ?: ''
                    env.TEST_TASK = cfg.testTask ?: ''

                    def tag = params.TAG?.trim()
                    // The tag dropdown falls back to bracketed placeholders when
                    // it cannot reach the remote; those are not real tags.
                    if (!tag || tag.startsWith('--') || tag.startsWith('ERROR')) {
                        error("No valid tag selected (got '${params.TAG}'). Pick a repository first so the TAG list can load.")
                    }
                    env.RESOLVED_TAG = tag

                    currentBuild.displayName = "${params.REPOSITORY} @ ${env.RESOLVED_TAG}${params.DRY_RUN ? ' (dry-run)' : ''}"

                    echo """
                    Repository : ${params.REPOSITORY}
                    URL        : ${env.REPO_URL}
                    Tag        : ${env.RESOLVED_TAG}
                    Registry   : ${env.REGISTRY}
                    Dist-tag   : ${env.NPM_DIST_TAG}
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
                        [$class: 'CloneOption', shallow: true, depth: 1, noTags: false, timeout: 20],
                    ]
                    if (env.REPO_SUBMODULES == 'true') {
                        extensions << [$class: 'SubmoduleOption', recursiveSubmodules: true, parentCredentials: true]
                    }

                    // dir() rather than the RelativeTargetDirectory extension,
                    // which the Git plugin deprecates for Pipeline jobs.
                    dir(env.SRC) {
                        checkout([
                            $class           : 'GitSCM',
                            branches         : [[name: "refs/tags/${env.RESOLVED_TAG}"]],
                            extensions       : extensions,
                            userRemoteConfigs: [[url: env.REPO_URL]],
                        ])
                    }
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

                    env.SELECTED_PACKAGES = publishable.collect { "${it.name}|${it.version}|${it.dir}" }.join('\n')
                    echo "\nSelected for publish (${publishable.size()}):"
                    publishable.each { echo "  ${it.name}@${it.version}" }
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
                                error("npm whoami failed against ${env.REGISTRY}. The token is missing, expired, or lacks access.")
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
                                        --tag "\$NPM_DIST_TAG" \
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
                Repository : ${params.REPOSITORY ?: '-'}
                Tag        : ${params.TAG ?: '-'}
                Mode       : ${params.DRY_RUN ? 'DRY RUN (nothing was published)' : 'LIVE PUBLISH'}
                Result     : ${currentBuild.currentResult}
                Published  : ${env.SUMMARY_PUBLISHED ?: '-'}
                Skipped    : ${env.SUMMARY_SKIPPED ?: '-'}
                Failed     : ${env.SUMMARY_FAILED ?: '-'}
                =========================================
                """.stripIndent()
            }
        }
        cleanup {
            // deleteDir() is a core Pipeline step; cleanWs() would need the
            // Workspace Cleanup plugin.
            deleteDir()
        }
    }
}

/**
 * Resolves the npm token and runs `body` with it exposed as
 * RESOLVED_NPM_TOKEN. Order: NPM_TOKEN parameter, then the "npm-token"
 * Jenkins credential, then NPM_TOKEN from the agent environment.
 */
def withNpmToken(Closure body) {
    // Read the password parameter from the environment, not from params:
    // params.NPM_TOKEN_INPUT hands back a hudson.util.Secret, which has no
    // String methods. Jenkins puts the plaintext in env for password
    // parameters (PasswordParameterValue.buildEnvironment -> Secret.toString),
    // and masks it in the console.
    def fromParameter = env.NPM_TOKEN_INPUT?.trim()

    if (fromParameter) {
        echo 'Using npm token from the build parameter.'
        withEnv(["RESOLVED_NPM_TOKEN=${fromParameter}"]) {
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
        withCredentials([string(credentialsId: 'npm-token', variable: 'RESOLVED_NPM_TOKEN')]) {
            body()
        }
        return
    }

    if (env.NPM_TOKEN?.trim()) {
        echo 'Using NPM_TOKEN from the agent environment.'
        withEnv(["RESOLVED_NPM_TOKEN=${env.NPM_TOKEN}"]) {
            body()
        }
        return
    }

    error('''
        No npm token available. Provide one of:
          1. the NPM_TOKEN_INPUT build parameter,
          2. a Jenkins "Secret text" credential with ID "npm-token",
          3. an NPM_TOKEN environment variable on the agent.
    '''.stripIndent().trim())
}
