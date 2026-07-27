pipeline {
    agent none

    parameters {
        choice(name: 'DEPLOY_TARGET', choices: ['none', 'staging', 'production'], description: 'Deploy target')
        booleanParam(name: 'BUILD_AND_PUSH_IMAGES', defaultValue: true, description: 'Build and push Docker images')
        booleanParam(name: 'PUSH_LATEST_TAG', defaultValue: false, description: 'Also publish :latest tag')
        booleanParam(name: 'RUN_SMOKE', defaultValue: true, description: 'Run post-deploy smoke checks')
        string(name: 'IMAGE_REPO', defaultValue: 'ghcr.io/mknoufi/stock_verify_ui', description: 'Image repository')
        string(name: 'IMAGE_TAG', defaultValue: '', description: 'Image tag (blank uses commit SHA)')
    }

    stages {
        stage('Verify') {
            agent { label 'linux && docker' }
            steps {
                sh './scripts/agent_ci.sh ci'
            }
        }

        stage('Build and Push') {
            when {
                expression { params.BUILD_AND_PUSH_IMAGES }
            }
            agent { label 'linux && docker' }
            steps {
                script {
                    def tag = params.IMAGE_TAG ?: env.GIT_COMMIT.take(12)
                    def backendImage = "${params.IMAGE_REPO}-backend:${tag}"
                    def nginxImage = "${params.IMAGE_REPO}-nginx:${tag}"
                    sh """
                        echo "Building backend/Dockerfile -> ${backendImage}"
                        echo "Building nginx/Dockerfile -> ${nginxImage}"
                        ./scripts/build_and_push.sh ${backendImage} ${nginxImage}
                    """
                }
            }
        }

        stage('Deploy Staging') {
            when {
                expression { params.DEPLOY_TARGET == 'staging' }
            }
            agent { label 'linux && docker' }
            environment {
                DEPLOY_HOST = credentials('stock-verify-staging-ssh')
                DEPLOY_USER = credentials('stock-verify-staging-ssh')
                DEPLOY_ENV_FILE = credentials('stock-verify-staging-env')
            }
            steps {
                sh './scripts/deploy_remote_compose.sh staging'
            }
        }

        stage('Deploy Production') {
            when {
                expression { params.DEPLOY_TARGET == 'production' }
            }
            agent { label 'linux && docker' }
            environment {
                DEPLOY_HOST = credentials('stock-verify-production-ssh')
                DEPLOY_USER = credentials('stock-verify-production-ssh')
                DEPLOY_ENV_FILE = credentials('stock-verify-production-env')
            }
            steps {
                sh './scripts/deploy_remote_compose.sh production'
            }
        }

        stage('Smoke') {
            when {
                expression { params.RUN_SMOKE }
            }
            agent { label 'linux && docker' }
            steps {
                sh './scripts/post_deploy_smoke.sh'
            }
        }
    }
}
