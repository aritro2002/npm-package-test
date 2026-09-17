pipeline {
    agent any

    parameters {
        gitParameter(
            name: 'TAG',
            description: 'Select the Git tag to build and publish. Check available tags at https://github.com/aritro2002/npm-package-test/tags',
            sortMode: 'DESCENDING_SMART',
            selectedValue: 'TOP',
            type: 'PT_TAG',
            quickFilterEnabled: true,
            listSize: '0',
            requiredParameter: true,
            useRepository: '.*npm-package-test.git'
        )
    }

    environment {
        NPM_TOKEN = credentials('npm-token')
    }

    stages {
        stage('Checkout Repository') {
            steps {
                script {
                    checkout(
                        changelog: false,
                        poll: false,
                        scm: [
                            $class: 'GitSCM',
                            branches: [[name: "refs/tags/${TAG}"]],
                            userRemoteConfigs: [[url: 'https://github.com/aritro2002/npm-package-test.git']]
                        ]
                    )
                }
            }
        }

        stage('Verify Tag Matches package.json') {
            steps {
                sh '''
                    set -eu
                    PKG_VERSION=$(node -p "require('./package.json').version")
                    TAG_VERSION=${TAG#v}
                    echo "package.json version: ${PKG_VERSION}"
                    echo "git tag version:      ${TAG_VERSION}"
                    if [ "${PKG_VERSION}" != "${TAG_VERSION}" ]; then
                        echo "ERROR: tag ${TAG} does not match package.json version ${PKG_VERSION}"
                        exit 1
                    fi
                '''
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Test') {
            steps {
                sh 'npm test'
            }
        }

        stage('Authenticate with npm') {
            steps {
                sh 'echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc'
            }
        }

        stage('Publish to npm') {
            steps {
                sh 'npm publish --access public'
            }
        }
    }

    post {
        always {
            sh 'rm -f .npmrc'
        }
    }
}
