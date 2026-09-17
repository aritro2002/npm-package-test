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

        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Authenticate with npm') {
            steps {
                sh 'echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > ~/.npmrc'
            }
        }

        stage('Publish to npm') {
            steps {
                sh 'npm publish --access public'
            }
        }
    }
}
