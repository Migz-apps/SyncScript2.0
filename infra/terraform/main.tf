terraform {
  required_version = ">= 1.5"
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.30"
    }
  }
}

variable "namespace" {
  type    = string
  default = "syncscript"
}

variable "image" {
  type    = string
  default = "ghcr.io/OWNER/REPO/syncscript-signaling:latest"
}

variable "replicas" {
  type    = number
  default = 2
}

provider "kubernetes" {
  config_path = "~/.kube/config"
}

resource "kubernetes_namespace" "syncscript" {
  metadata {
    name = var.namespace
  }
}

resource "kubernetes_deployment" "signaling" {
  metadata {
    name      = "syncscript-signaling"
    namespace = kubernetes_namespace.syncscript.metadata[0].name
    labels = {
      app = "syncscript-signaling"
    }
  }

  spec {
    replicas = var.replicas

    selector {
      match_labels = {
        app = "syncscript-signaling"
      }
    }

    template {
      metadata {
        labels = {
          app = "syncscript-signaling"
        }
      }

      spec {
        container {
          name  = "signaling"
          image = var.image

          port {
            container_port = 4444
          }

          env {
            name  = "PORT"
            value = "4444"
          }

          env {
            name  = "REDIS_URL"
            value = "redis://syncscript-redis:6379"
          }

          env {
            name  = "METRICS_ENABLED"
            value = "true"
          }

          liveness_probe {
            http_get {
              path = "/health/live"
              port = 4444
            }
            initial_delay_seconds = 10
            period_seconds        = 15
          }

          readiness_probe {
            http_get {
              path = "/health/ready"
              port = 4444
            }
            initial_delay_seconds = 5
            period_seconds        = 10
          }

          resources {
            requests = {
              cpu    = "150m"
              memory = "256Mi"
            }
            limits = {
              cpu    = "500m"
              memory = "512Mi"
            }
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "signaling" {
  metadata {
    name      = "syncscript-signaling"
    namespace = kubernetes_namespace.syncscript.metadata[0].name
  }

  spec {
    selector = {
      app = "syncscript-signaling"
    }

    port {
      port        = 80
      target_port = 4444
    }

    type = "ClusterIP"
  }
}

output "namespace" {
  value = kubernetes_namespace.syncscript.metadata[0].name
}

output "service" {
  value = kubernetes_service.signaling.metadata[0].name
}
