/*
 * Hyperswitch package publish pipeline.
 *
 * Pick a package, pick one of that package's tags, supply a token. The
 * pipeline checks the upstream Juspay repository out at that tag, builds the
 * package, RE-SCOPES it to @aritro2002 and publishes it.
 *
 * Re-scoping is the point: the upstream packages live under @juspay-tech,
 * which we have no publish rights to. Only the package's own `name` is
 * rewritten; its dependencies keep pointing at the real @juspay-tech packages
 * on npm, so the published result still installs and works.
 *
 * REQUIRES the Active Choices plugin (uno-choice) for the reactive TAG list.
 *
 * Token resolution order: NPM_TOKEN_INPUT parameter -> "npm-token" Jenkins
 * credential -> agent NPM_TOKEN environment variable.
 */

import groovy.transform.Field

// Everything we publish goes to this scope, never @juspay-tech.
@Field String TARGET_SCOPE = '@aritro2002'

// dir is relative to the repo root. sharedRepo marks a Lerna monorepo, whose
// tags are per package ("<name>@<version>") rather than repo-wide ("vX.Y.Z").
@Field Map PACKAGE_CONFIG = [
    '@juspay-tech/hyper-js': [
        url: 'https://github.com/juspay/hyper-js.git',
        dir: '.', sharedRepo: false,
    ],
    '@juspay-tech/react-hyper-js': [
        url: 'https://github.com/juspay/react-hyper-js.git',
        dir: '.', sharedRepo: false,
    ],
    '@juspay-tech/react-native-hyperswitch': [
        url: 'https://github.com/juspay/react-native-hyperswitch.git',
        dir: 'packages/@juspay-tech/react-native-hyperswitch', sharedRepo: true,
    ],
    '@juspay-tech/react-native-hyperswitch-click-to-pay': [
        url: 'https://github.com/juspay/react-native-hyperswitch.git',
        dir: 'packages/@juspay-tech/react-native-hyperswitch-click-to-pay', sharedRepo: true,
    ],
    '@juspay-tech/react-native-hyperswitch-netcetera-3ds': [
        url: 'https://github.com/juspay/react-native-hyperswitch.git',
        dir: 'packages/@juspay-tech/react-native-hyperswitch-netcetera-3ds', sharedRepo: true,
    ],
    '@juspay-tech/react-native-hyperswitch-payment-methods': [
        url: 'https://github.com/juspay/react-native-hyperswitch.git',
        dir: 'packages/@juspay-tech/react-native-hyperswitch-payment-methods', sharedRepo: true,
    ],
    '@juspay-tech/react-native-hyperswitch-paypal': [
        url: 'https://github.com/juspay/react-native-hyperswitch.git',
        dir: 'packages/@juspay-tech/react-native-hyperswitch-paypal', sharedRepo: true,
    ],
    '@juspay-tech/react-native-hyperswitch-samsung-pay': [
        url: 'https://github.com/juspay/react-native-hyperswitch.git',
        dir: 'packages/@juspay-tech/react-native-hyperswitch-samsung-pay', sharedRepo: true,
    ],
    '@juspay-tech/react-native-hyperswitch-scancard': [
        url: 'https://github.com/juspay/react-native-hyperswitch.git',
        dir: 'packages/@juspay-tech/react-native-hyperswitch-scancard', sharedRepo: true,
    ],
    '@juspay-tech/react-native-hyperswitch-trident-3ds': [
        url: 'https://github.com/juspay/react-native-hyperswitch.git',
        dir: 'packages/@juspay-tech/react-native-hyperswitch-trident-3ds', sharedRepo: true,
    ],
]

// Active Choices scripts run on the controller in their own context and cannot
// see the fields above, so the package list is repeated inside them.

@Field String PACKAGE_CHOICES_SCRIPT = '''
return [
    '@juspay-tech/hyper-js',
    '@juspay-tech/react-hyper-js',
    '@juspay-tech/react-native-hyperswitch',
    '@juspay-tech/react-native-hyperswitch-click-to-pay',
    '@juspay-tech/react-native-hyperswitch-netcetera-3ds',
    '@juspay-tech/react-native-hyperswitch-payment-methods',
    '@juspay-tech/react-native-hyperswitch-paypal',
    '@juspay-tech/react-native-hyperswitch-samsung-pay',
    '@juspay-tech/react-native-hyperswitch-scancard',
    '@juspay-tech/react-native-hyperswitch-trident-3ds',
]
'''

@Field String TAG_CHOICES_SCRIPT = '''
def config = [
    '@juspay-tech/hyper-js'                                : ['https://github.com/juspay/hyper-js.git', false],
    '@juspay-tech/react-hyper-js'                          : ['https://github.com/juspay/react-hyper-js.git', false],
    '@juspay-tech/react-native-hyperswitch'                : ['https://github.com/juspay/react-native-hyperswitch.git', true],
    '@juspay-tech/react-native-hyperswitch-click-to-pay'   : ['https://github.com/juspay/react-native-hyperswitch.git', true],
    '@juspay-tech/react-native-hyperswitch-netcetera-3ds'  : ['https://github.com/juspay/react-native-hyperswitch.git', true],
    '@juspay-tech/react-native-hyperswitch-payment-methods': ['https://github.com/juspay/react-native-hyperswitch.git', true],
    '@juspay-tech/react-native-hyperswitch-paypal'         : ['https://github.com/juspay/react-native-hyperswitch.git', true],
    '@juspay-tech/react-native-hyperswitch-samsung-pay'    : ['https://github.com/juspay/react-native-hyperswitch.git', true],
    '@juspay-tech/react-native-hyperswitch-scancard'       : ['https://github.com/juspay/react-native-hyperswitch.git', true],
    '@juspay-tech/react-native-hyperswitch-trident-3ds'    : ['https://github.com/juspay/react-native-hyperswitch.git', true],
]

def entry = config[PACKAGE]
if (!entry) {
    return ['-- select a package --']
}

def url = entry[0]
def sharedRepo = entry[1]

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

    if (sharedRepo) {
        // Lerna independent versioning tags as "<name>@<version>". Older tags
        // in this repo drop the scope, so accept both forms. The trailing '@'
        // anchors the match: without it "react-native-hyperswitch@" would also
        // swallow "react-native-hyperswitch-scancard@...".
        def scoped = PACKAGE + '@'
        def bare = PACKAGE.substring(PACKAGE.indexOf('/') + 1) + '@'
        tags = tags.findAll { it.startsWith(scoped) || it.startsWith(bare) }
    }

    if (!tags) {
        return ['-- no tags for ' + PACKAGE + ' --']
    }

    // Newest first, comparing only the version part. Numeric components are
    // zero-padded so 0.10.0 ranks above 0.9.0 rather than sorting
    // lexicographically.
    def key = { tag ->
        def at = tag.lastIndexOf('@')
        def version = (at > 0 ? tag.substring(at + 1) : tag).replaceFirst('^v', '')
        def parts = version.split('[._+-]')
        def numericFirst = parts && parts[0].isInteger() ? '1' : '0'
        numericFirst + parts.collect { p -> p.isInteger() ? p.padLeft(10, '0') : p }.join('.')
    }

    return tags.sort { a, b -> key(b) <=> key(a) }
} catch (failure) {
    return ['-- error listing tags: ' + failure.getMessage() + ' --']
}
'''

pipeline {
    agent any

    options {
        // buildDiscarder and disableConcurrentBuilds are job properties and are
        // set in the properties() call below; declaring them here as well would
        // make the two calls fight over the same job config.
        timeout(time: 60, unit: 'MINUTES')
    }

    environment {
        SRC = 'source'
        // Workspace-local npmrc. Never ~/.npmrc: that outlives the build and
        // leaks the token to every other job on the agent.
        NPM_CONFIG_USERCONFIG = "${WORKSPACE}/.npmrc-publish"
        REGISTRY = 'https://registry.npmjs.org/'
        NPM_DIST_TAG = 'latest'
    }

    stages {

        stage('Parameters') {
            steps {
                script {
                    properties([
                        buildDiscarder(logRotator(numToKeepStr: '30')),
                        disableConcurrentBuilds(),
                        parameters([
                            [$class              : 'ChoiceParameter',
                             name                : 'PACKAGE',
                             description         : 'Package to publish. Changing this reloads the TAG list.',
                             choiceType          : 'PT_SINGLE_SELECT',
                             // No filter box: ten fixed entries do not need one.
                             filterable          : false,
                             randomName          : 'choice-parameter-package',
                             script              : [
                                 $class        : 'GroovyScript',
                                 fallbackScript: [classpath: [], sandbox: false, script: "return ['ERROR: could not load package list']"],
                                 script        : [classpath: [], sandbox: false, script: PACKAGE_CHOICES_SCRIPT],
                             ]],
                            [$class              : 'CascadeChoiceParameter',
                             name                : 'TAG',
                             description         : 'Tag to publish, newest first, listed for the package selected above.',
                             choiceType          : 'PT_SINGLE_SELECT',
                             referencedParameters: 'PACKAGE',
                             // No filter box: no package here has more than a
                             // handful of tags.
                             filterable          : false,
                             randomName          : 'choice-parameter-tag',
                             script              : [
                                 $class        : 'GroovyScript',
                                 fallbackScript: [classpath: [], sandbox: false, script: "return ['ERROR: could not list tags']"],
                                 script        : [classpath: [], sandbox: false, script: TAG_CHOICES_SCRIPT],
                             ]],
                            password(
                                name: 'NPM_TOKEN_INPUT',
                                description: 'npm automation token. Leave blank to use the "npm-token" Jenkins credential, then the agent NPM_TOKEN env var.'
                            ),
                        ]),
                    ])

                    if (!params.PACKAGE) {
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
                    def cfg = PACKAGE_CONFIG[params.PACKAGE]
                    if (!cfg) {
                        error("No configuration for package '${params.PACKAGE}'.")
                    }

                    def tag = params.TAG?.trim()
                    // The dropdown falls back to bracketed placeholders when it
                    // cannot reach the remote or the package has no tags.
                    if (!tag || tag.startsWith('--') || tag.startsWith('ERROR')) {
                        error("No valid tag selected (got '${params.TAG}'). Pick a package first so the TAG list can load.")
                    }

                    def bareName = params.PACKAGE.substring(params.PACKAGE.indexOf('/') + 1)

                    env.REPO_URL = cfg.url
                    env.PKG_DIR = cfg.dir
                    env.RESOLVED_TAG = tag
                    env.SOURCE_NAME = params.PACKAGE
                    env.TARGET_NAME = "${TARGET_SCOPE}/${bareName}"

                    currentBuild.displayName = "${env.TARGET_NAME} @ ${tag}"

                    echo """
                    Source package : ${env.SOURCE_NAME}
                    Publishing as  : ${env.TARGET_NAME}
                    Repository     : ${env.REPO_URL}
                    Directory      : ${env.PKG_DIR}
                    Tag            : ${env.RESOLVED_TAG}
                    Registry       : ${env.REGISTRY}
                    """.stripIndent()
                }
            }
        }

        stage('Validate tag') {
            steps {
                // Tag names here contain '/' and '@', so the ref is split on the
                // literal "refs/tags/" rather than on the last '/'.
                sh '''
                    set -eu
                    if ! git ls-remote --tags --exit-code "$REPO_URL" "refs/tags/$RESOLVED_TAG" >/dev/null 2>&1; then
                        echo "Tag '$RESOLVED_TAG' does not exist in $REPO_URL"
                        echo ""
                        echo "Tags in this repository (most recent 20):"
                        git ls-remote --tags --refs "$REPO_URL" \
                            | awk -F'refs/tags/' '{print $2}' \
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
                    dir(env.SRC) {
                        checkout([
                            $class           : 'GitSCM',
                            branches         : [[name: "refs/tags/${env.RESOLVED_TAG}"]],
                            extensions       : [
                                [$class: 'CloneOption', shallow: true, depth: 1, noTags: false, timeout: 30],
                                [$class: 'SubmoduleOption', recursiveSubmodules: true, parentCredentials: true],
                            ],
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

                    if [ ! -f "$PKG_DIR/package.json" ]; then
                        echo "No package.json at $PKG_DIR for tag $RESOLVED_TAG."
                        echo "The package may not have existed at this tag."
                        exit 1
                    fi
                    echo "Found $PKG_DIR/package.json"
                '''
            }
        }

        stage('Install dependencies') {
            steps {
                dir(env.SRC) {
                    // react-native-hyperswitch is a yarn 3 workspace; the web
                    // repos use npm. Pick by lockfile, and degrade rather than
                    // fail when yarn is not on the agent.
                    sh '''
                        set -eu
                        if [ -f yarn.lock ]; then
                            echo "yarn.lock present; enabling corepack."
                            corepack enable >/dev/null 2>&1 || true
                            if command -v yarn >/dev/null 2>&1; then
                                yarn install --immutable || yarn install
                            else
                                echo "yarn unavailable; falling back to npm install."
                                npm install --no-audit --no-fund --legacy-peer-deps
                            fi
                        elif [ -f package-lock.json ]; then
                            npm ci || npm install --no-audit --no-fund
                        else
                            npm install --no-audit --no-fund
                        fi
                    '''
                }
            }
        }

        stage('Build package') {
            steps {
                dir("${env.SRC}/${env.PKG_DIR}") {
                    // These packages build via `prepare` (react-native-builder-bob)
                    // or `build`. npm publish would run `prepare` anyway; doing it
                    // here makes a build failure land in its own stage.
                    sh '''
                        set -eu
                        for task in prepare build; do
                            if node -e 'const s=require("./package.json").scripts||{};process.exit(s[process.argv[1]]?0:1)' "$task"; then
                                echo "Running '$task'..."
                                npm run "$task"
                                exit 0
                            fi
                        done
                        echo "No prepare or build script; nothing to build."
                    '''
                }
            }
        }

        stage('Re-scope package') {
            steps {
                script {
                    writeFile file: 'rescope.cjs', text: '''
const fs = require('fs');

const [file, targetScope] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));

const original = pkg.name;
const bare = original.includes('/') ? original.slice(original.indexOf('/') + 1) : original;

pkg.name = `${targetScope}/${bare}`;

// A scoped package is private by default; publishing needs this explicitly.
pkg.publishConfig = Object.assign({}, pkg.publishConfig, { access: 'public' });

// Dependencies are deliberately left alone. They point at the upstream
// @juspay-tech packages that are already on npm, so the republished package
// still installs. Rewriting them would break it unless every dependency were
// republished too.

fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\\n');
console.log(`${original}  ->  ${pkg.name}@${pkg.version}`);
'''.trim()

                    sh 'node rescope.cjs "$SRC/$PKG_DIR/package.json" "' + TARGET_SCOPE + '"'

                    def version = sh(
                        returnStdout: true,
                        script: 'node -p "require(\'./\' + process.env.SRC + \'/\' + process.env.PKG_DIR + \'/package.json\').version"'
                    ).trim()
                    env.PKG_VERSION = version
                    echo "Will publish ${env.TARGET_NAME}@${version}"
                }
            }
        }

        stage('Authenticate npm') {
            steps {
                script {
                    withNpmToken { tokenVar ->
                        // Pass the variable NAME through Groovy, never the secret:
                        // interpolating a secret into a step argument defeats
                        // Jenkins' log masking.
                        env.TOKEN_VAR = tokenVar

                        // `set +x` first. Jenkins runs sh with tracing enabled, so
                        // without it the line writing the token is echoed in
                        // plaintext.
                        sh '''
                            set +x
                            set -eu
                            umask 077
                            token=$(printenv "$TOKEN_VAR")
                            registry_host=$(echo "$REGISTRY" | sed -E 's#^https?://##; s#/$##')
                            {
                                echo "registry=$REGISTRY"
                                echo "//$registry_host/:_authToken=$token"
                            } > "$NPM_CONFIG_USERCONFIG"
                            echo "Wrote npm credentials for $registry_host"
                        '''

                        sh 'echo "Authenticated as: $(npm whoami --registry "$REGISTRY")"'
                    }
                }
            }
        }

        stage('Publish') {
            steps {
                script {
                    // npm publish is not idempotent: republishing an existing
                    // version is a hard error. Checking first turns a re-run into
                    // a no-op rather than a failure.
                    def exists = sh(
                        returnStatus: true,
                        script: 'npm view "$TARGET_NAME@$PKG_VERSION" version --registry "$REGISTRY" >/dev/null 2>&1'
                    ) == 0

                    if (exists) {
                        echo "${env.TARGET_NAME}@${env.PKG_VERSION} is already on the registry; nothing to do."
                        env.PUBLISH_RESULT = 'skipped (already published)'
                        return
                    }

                    dir("${env.SRC}/${env.PKG_DIR}") {
                        sh '''
                            set -eu
                            npm publish \
                                --access public \
                                --tag "$NPM_DIST_TAG" \
                                --registry "$REGISTRY"
                        '''
                    }

                    env.PUBLISH_RESULT = 'published'
                    echo "Published ${env.TARGET_NAME}@${env.PKG_VERSION}"
                }
            }
        }
    }

    post {
        always {
            sh '''
                rm -f "$NPM_CONFIG_USERCONFIG" || true
                rm -f rescope.cjs || true
            '''
            script {
                echo """
                ================ SUMMARY ================
                Source  : ${env.SOURCE_NAME ?: '-'} @ ${params.TAG ?: '-'}
                Target  : ${env.TARGET_NAME ?: '-'}@${env.PKG_VERSION ?: '-'}
                Outcome : ${env.PUBLISH_RESULT ?: 'did not reach publish'}
                Result  : ${currentBuild.currentResult}
                =========================================
                """.stripIndent()
            }
        }
        cleanup {
            deleteDir()
        }
    }
}

def withNpmToken(Closure body) {
    // Hands `body` the NAME of the environment variable holding the token,
    // never the token itself.
    //
    // The parameter is read from env rather than params because a password
    // parameter surfaces through params as a hudson.util.Secret, which has no
    // String methods; Jenkins puts the plaintext in env for password params.
    if (env.NPM_TOKEN_INPUT?.trim()) {
        echo 'Using npm token from the build parameter.'
        body('NPM_TOKEN_INPUT')
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
        withCredentials([string(credentialsId: 'npm-token', variable: 'NPM_TOKEN_CRED')]) {
            body('NPM_TOKEN_CRED')
        }
        return
    }

    if (env.NPM_TOKEN?.trim()) {
        echo 'Using NPM_TOKEN from the agent environment.'
        body('NPM_TOKEN')
        return
    }

    error('''
        No npm token available. Provide one of:
          1. the NPM_TOKEN_INPUT build parameter,
          2. a Jenkins "Secret text" credential with ID "npm-token",
          3. an NPM_TOKEN environment variable on the agent.
    '''.stripIndent().trim())
}
