terraform {
  required_version = ">= 1.0"

  # State lives in GCS, not on disk, so it survives any one checkout and every
  # session can run `plan` against the same truth.
  #
  # The bucket is versioned, so a bad write is recoverable, and it is
  # deliberately NOT managed by Terraform — a backend cannot bootstrap the
  # bucket it stores itself in. The project and the bucket were created once,
  # by hand, on 2026-09-11:
  #
  #   gcloud projects create csarko-sh --name=csarko-sh
  #   gcloud billing projects link csarko-sh --billing-account=<Main Billing>
  #   gcloud storage buckets create gs://csarko-sh-tfstate --project=csarko-sh \
  #     --location=us-west1 --uniform-bucket-level-access --public-access-prevention
  #   gcloud storage buckets update gs://csarko-sh-tfstate --versioning
  backend "gcs" {
    bucket = "csarko-sh-tfstate"
    prefix = "csarko-sh"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

provider "google-beta" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

module "gcp_hosting" {
  source = "./modules/gcp-hosting"

  project_id            = var.gcp_project_id
  site_id               = var.hosting_site_id
  domain_name           = var.domain_name
  redirect_domain_names = var.redirect_domain_names

  providers = {
    google      = google
    google-beta = google-beta
  }
}

# The site's own hostname, e.g. "csarko-sh.web.app". default_url stays populated
# for the life of the site, unlike required_dns_updates, which empties once a
# domain reconciles (the fps repo learned this the hard way).
locals {
  hosting_cname_target = trimprefix(module.gcp_hosting.default_url, "https://")
}

# csarko.sh is a zone apex, so it cannot be a CNAME the way games.csarko.sh is
# in the fps repo. Firebase Hosting serves an apex from a fixed A record plus a
# TXT record that proves which site owns the domain.
module "aws_dns" {
  source = "./modules/aws-dns"

  zone_name   = var.dns_zone_name
  domain_name = var.domain_name
  a_records   = var.firebase_hosting_ips
  txt_records = ["hosting-site=${module.gcp_hosting.site_id}"]

  cname_records = { for d in var.redirect_domain_names : d => local.hosting_cname_target }

  providers = {
    aws = aws
  }
}
