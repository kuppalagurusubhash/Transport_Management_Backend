pipeline {
  agent any
  environment {
    IMAGE_NAME = "backend"
    VM_USER   = "azureuser"
    VM_IP     = "172.198.161.164"
    APP_NAME  = "transport-backend"
    PORT      = "9090"
    IMAGE_TAG = "${BUILD_NUMBER}"
  }
  options {
    timestamps()
    disableConcurrentBuilds()
  }
  stages {
    stage('Checkout') {
      steps {
        git branch: 'dev_s',
            credentialsId: 'github-token',
            url: 'https://github.com/kuppalagurusubhash/Transport_Backend.git'
      }
    }
    stage('Build Docker Image') {
      steps {
        sh """
          docker build -t $IMAGE_NAME:$IMAGE_TAG .
          docker tag $IMAGE_NAME:$IMAGE_TAG $IMAGE_NAME:latest
        """
      }
    }
    stage('Push Image') {
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'dockerhub-creds',
          usernameVariable: 'DOCKER_USER',
          passwordVariable: 'DOCKER_PASS'
        )]) {
          sh """
            echo \$DOCKER_PASS | docker login -u \$DOCKER_USER --password-stdin
            docker push $IMAGE_NAME:$IMAGE_TAG
            docker push $IMAGE_NAME:latest
          """
        }
      }
    }
    stage('Deploy to Azure VM') {
      steps {
        sshagent(['azure-vm-ssh']) {
          sh """
          ssh -o StrictHostKeyChecking=no $VM_USER@$VM_IP '
            docker pull $IMAGE_NAME:$IMAGE_TAG &&
            docker stop $APP_NAME || true &&
            docker rm $APP_NAME || true &&
            docker run -d \
              --name $APP_NAME \
              --env-file /home/azureuser/backend.env \
              -p 9090:9090 \
              --restart unless-stopped \
              $IMAGE_NAME:$IMAGE_TAG
          '
          """
        }
      }
    }
    stage('Cleanup Old Images') {
      steps {
        sh "docker image prune -f"
      }
    }
  }
}