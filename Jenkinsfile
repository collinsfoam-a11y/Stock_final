pipeline {
  agent { label 'linux && docker' }

  options {
    ansiColor('xterm')
    disableConcurrentBuilds()
    timestamps()
  }

  parameters {
    choice(name: 'DEPLOY_TARGET', choices: ['none', 'staging', 'production'], description: 'Choose "none" for build-only runs.')
    booleanParam(name: 'BUILD_AND_PUSH_IMAGES', defaultValue: true, description: 'Build and push backend/nginx images before any deploy step.')
    booleanParam(name: 'PUSH_LATEST_TAG', defaultValue: true, description: 'Also publish the :latest tags when building images.')
    booleanParam(name: 'RUN_IMAGE_SCAN', defaultValue: false, description: 'Run Trivy CRITICAL vulnerability scan on built images before deploy.')
    booleanParam(name: 'RUN_SMOKE', defaultValue: true, description: 'Run post-deploy smoke checks after deployment.')
    string(name: 'IMAGE_REPO', defaultValue: 'ghcr.io/mknoufi/stock_verify_ui', description: 'Registry repository prefix without the -backend/-nginx suffix.')
    string(name: 'IMAGE_TAG', defaultValue: '', description: 'Optional explicit image tag. Leave blank to use the current commit SHA.')
  }

  environment {
    REGISTRY = 'ghcr.io'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Resolve Build Metadata') {
      steps {
        script {
          def requestedTag = params.IMAGE_TAG?.trim()
          env.RESOLVED_IMAGE_TAG = requestedTag ? requestedTag : env.GIT_COMMIT.take(12)
          env.BACKEND_IMAGE = "${params.IMAGE_REPO}-backend:${env.RESOLVED_IMAGE_TAG}"
          env.NGINX_IMAGE = "${params.IMAGE_REPO}-nginx:${env.RESOLVED_IMAGE_TAG}"
          env.DEPLOY_ENABLED = params.DEPLOY_TARGET != 'none' ? 'true' : 'false'
          currentBuild.displayName = "#${env.BUILD_NUMBER} ${params.DEPLOY_TARGET} ${env.RESOLVED_IMAGE_TAG}"
        }
      }
    }

    stage('Verify') {
      steps {
        sh 'chmod +x scripts/*.sh'
        sh './scripts/agent_ci.sh ci'
      }
    }

    stage('Build Backend Import Smoke') {
      when {
        expression { return params.BUILD_AND_PUSH_IMAGES }
      }
      steps {
        sh '''
          docker build --no-cache -f backend/Dockerfile -t stock-verify-backend-import-smoke ./backend
          docker run --rm \
            -e JWT_SECRET=ci-import-guard-jwt-secret-32-chars \
            -e JWT_REFRESH_SECRET=ci-import-guard-refresh-secret-32 \
            -e ENVIRONMENT=production \
            stock-verify-backend-import-smoke \
            python -c "import backend.server"
        '''
      }
    }

    stage('Build And Push Images') {
      when {
        expression { return params.BUILD_AND_PUSH_IMAGES }
      }
      steps {
        withCredentials([usernamePassword(credentialsId: 'ghcr-stock-verify', usernameVariable: 'GHCR_USERNAME', passwordVariable: 'GHCR_TOKEN')]) {
          sh '''
            printf '%s' "$GHCR_TOKEN" | docker login "$REGISTRY" -u "$GHCR_USERNAME" --password-stdin

            docker build -f backend/Dockerfile -t "$BACKEND_IMAGE" ./backend
            docker push "$BACKEND_IMAGE"

            docker build -f nginx/Dockerfile -t "$NGINX_IMAGE" .
            docker push "$NGINX_IMAGE"
          '''
          script {
            if (params.PUSH_LATEST_TAG) {
              sh '''
                BACKEND_LATEST="${IMAGE_REPO}-backend:latest"
                NGINX_LATEST="${IMAGE_REPO}-nginx:latest"

                docker tag "$BACKEND_IMAGE" "$BACKEND_LATEST"
                docker push "$BACKEND_LATEST"

                docker tag "$NGINX_IMAGE" "$NGINX_LATEST"
                docker push "$NGINX_LATEST"
              '''
            }
          }
        }
      }
    }

    stage('Container Vulnerability Scan') {
      when {
        allOf {
          expression { return params.BUILD_AND_PUSH_IMAGES }
          expression { return params.RUN_IMAGE_SCAN }
        }
      }
      steps {
        sh '''
          docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.65.0 \
            image --severity CRITICAL --ignore-unfixed --exit-code 1 "$BACKEND_IMAGE"
          docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.65.0 \
            image --severity CRITICAL --ignore-unfixed --exit-code 1 "$NGINX_IMAGE"
        '''
      }
    }

    stage('Deploy') {
      when {
        expression { return env.DEPLOY_ENABLED == 'true' }
      }
      steps {
        script {
          def target = params.DEPLOY_TARGET
          def key = target.toUpperCase()
          withCredentials([
            string(credentialsId: "stock-verify-${target}-env", variable: 'DEPLOY_ENV_FILE'),
            usernamePassword(credentialsId: 'ghcr-stock-verify', usernameVariable: 'DEPLOY_REGISTRY_USERNAME', passwordVariable: 'DEPLOY_REGISTRY_TOKEN')
          ]) {
            sshagent(credentials: ["stock-verify-${target}-ssh"]) {
              withEnv([
                "DEPLOY_HOST=${env["DEPLOY_HOST_${key}"]}",
                "DEPLOY_USER=${env["DEPLOY_USER_${key}"]}",
                "DEPLOY_PORT=${env["DEPLOY_PORT_${key}"] ?: '22'}",
                "DEPLOY_PATH=${env["DEPLOY_PATH_${key}"]}",
                "DEPLOY_HEALTHCHECK_URL=${env["DEPLOY_HEALTHCHECK_URL_${key}"] ?: ''}",
                "DEPLOY_APP_BASE_URL=${env["DEPLOY_APP_BASE_URL_${key}"] ?: ''}",
                "DEPLOY_FRONTEND_URL=${env["DEPLOY_FRONTEND_URL_${key}"] ?: ''}",
                "DEPLOY_KNOWN_HOSTS=${env["DEPLOY_KNOWN_HOSTS_${key}"] ?: ''}",
                "BACKEND_IMAGE=${env.BACKEND_IMAGE}",
                "NGINX_IMAGE=${env.NGINX_IMAGE}",
                "GITHUB_SHA=${env.GIT_COMMIT}"
              ]) {
                sh '''
                  test -n "$DEPLOY_HOST"
                  test -n "$DEPLOY_USER"
                  test -n "$DEPLOY_PATH"
                  chmod +x scripts/deploy_remote_compose.sh
                  ./scripts/deploy_remote_compose.sh
                '''
              }
            }
          }
        }
      }
    }

    stage('Smoke') {
      when {
        allOf {
          expression { return env.DEPLOY_ENABLED == 'true' }
          expression { return params.RUN_SMOKE }
        }
      }
      steps {
        script {
          def target = params.DEPLOY_TARGET
          def key = target.toUpperCase()
          withCredentials([usernamePassword(credentialsId: "stock-verify-${target}-smoke", usernameVariable: 'SMOKE_USERNAME', passwordVariable: 'SMOKE_PASSWORD')]) {
            withEnv([
              "SMOKE_HEALTH_URL=${env["DEPLOY_HEALTHCHECK_URL_${key}"] ?: ''}",
              "SMOKE_BASE_URL=${env["DEPLOY_APP_BASE_URL_${key}"] ?: ''}",
              "SMOKE_FRONTEND_URL=${env["DEPLOY_FRONTEND_URL_${key}"] ?: ''}"
            ]) {
              sh '''
                chmod +x scripts/post_deploy_smoke.sh
                ./scripts/post_deploy_smoke.sh
              '''
            }
          }
        }
      }
    }
  }

  post {
    always {
      echo "backend image: ${env.BACKEND_IMAGE ?: 'n/a'}"
      echo "nginx image: ${env.NGINX_IMAGE ?: 'n/a'}"
    }
  }
}
