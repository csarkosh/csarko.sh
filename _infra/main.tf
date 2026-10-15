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

# The billing budget API refuses a user's own credentials unless the call names
# a project to bill it to. Scoped to its own alias so that header is sent for
# the budget only, not for every other call the modules make (the game-dayhike
# repo found this first).
provider "google" {
  alias                 = "billing"
  project               = var.gcp_project_id
  region                = var.gcp_region
  billing_project       = var.gcp_project_id
  user_project_override = true
}

# The same, on the beta provider, for the Firebase web app's configuration:
# read through the Identity Toolkit API, which makes the same demand.
provider "google-beta" {
  alias                 = "quota"
  project               = var.gcp_project_id
  region                = var.gcp_region
  billing_project       = var.gcp_project_id
  user_project_override = true
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

# The admin dashboard, https://admin.csarko.sh: a second Hosting site in the
# same project, so it shares the public site's quota and Firebase project but
# deploys on its own (`firebase deploy --only hosting:admin`), and a site
# deploy never touches it. No redirect domains: nothing else should land here.
# The first module instance owns the project-level Firebase resources, so this
# one only adds the site and its domain, and waits for the first.
module "gcp_hosting_admin" {
  source = "./modules/gcp-hosting"

  project_id            = var.gcp_project_id
  site_id               = var.admin_hosting_site_id
  domain_name           = var.admin_domain_name
  redirect_domain_names = []
  manage_project        = false

  providers = {
    google      = google
    google-beta = google-beta
  }

  depends_on = [module.gcp_hosting]
}

# The API behind the dashboard: Cloud Run, its secrets, Firestore for the
# daily snapshots, the Scheduler job that takes them, and the project budget.
# Google sign-in for admin.csarko.sh: every app's admin API trusts the ID
# tokens this project's Firebase Auth issues, plus its own email allowlist.
module "gcp_auth" {
  source = "./modules/gcp-auth"

  project_id         = var.gcp_project_id
  authorized_domains = [var.admin_domain_name, trimprefix(module.gcp_hosting_admin.default_url, "https://")]

  providers = {
    google            = google
    google.quota      = google.billing
    google-beta       = google-beta
    google-beta.quota = google-beta.quota
  }

  depends_on = [module.gcp_hosting_admin]
}

module "gcp_admin_api" {
  source = "./modules/gcp-admin-api"

  project_id             = var.gcp_project_id
  region                 = var.gcp_region
  site_url               = "https://${var.domain_name}"
  sitemap_url            = "https://${var.domain_name}/sitemap.xml"
  hosting_site_id        = module.gcp_hosting.site_id
  visits_dataset         = local.visits_dataset
  visits_history_dataset = local.visits_history_dataset
  visits_history_until   = var.visits_history_until
  gsc_property           = "sc-domain:${var.domain_name}"
  youtube_handle         = var.youtube_handle
  github_owner           = var.github_owner
  admin_emails           = var.admin_emails
  allowed_origins = [
    "https://${var.admin_domain_name}",
    # The local preview of admin/public, served by its preview script.
    "http://localhost:8788",
  ]
  billing_account_id = var.billing_account_id
  monthly_budget_usd = var.monthly_budget_usd

  providers = {
    google         = google
    google.billing = google.billing
    google-beta    = google-beta
  }
}

# The two datasets' names are set here and passed to both modules: the admin API
# reads them, and gcp_visits waits on the whole admin module (its APIs), so the
# admin module cannot take them from gcp_visits' outputs without a cycle.
locals {
  visits_dataset         = "csarko_visits"
  visits_history_dataset = "csarko_history"
}

module "gcp_visits" {
  source = "./modules/gcp-visits"

  project_id                   = var.gcp_project_id
  region                       = var.gcp_region
  origins                      = ["https://${var.domain_name}"]
  dataset                      = local.visits_dataset
  history_dataset              = local.visits_history_dataset
  reader_service_account_email = module.gcp_admin_api.service_account_email

  providers = {
    google      = google
    google-beta = google-beta
  }

  # The admin module enables run, secretmanager and iam; this module only adds logging and bigquery.
  depends_on = [module.gcp_admin_api]
}

# Each site's own hostname, e.g. "csarko-sh.web.app". default_url stays populated
# for the life of the site, unlike required_dns_updates, which empties once a
# domain reconciles (the fps repo learned this the hard way).
locals {
  hosting_cname_target       = trimprefix(module.gcp_hosting.default_url, "https://")
  admin_hosting_cname_target = trimprefix(module.gcp_hosting_admin.default_url, "https://")
}

# csarko.sh is a zone apex, so it cannot be a CNAME the way games.csarko.sh is
# in the fps repo. Firebase Hosting serves an apex from a fixed A record plus a
# TXT record that proves which site owns the domain.
module "aws_dns" {
  source = "./modules/aws-dns"

  zone_name   = var.dns_zone_name
  domain_name = var.domain_name
  a_records   = var.firebase_hosting_ips

  # The apex TXT is one record set, so every apex TXT value lives in this list.
  txt_records = [
    # Firebase Hosting: proves the csarko-sh site owns the domain.
    "hosting-site=${module.gcp_hosting.site_id}",
    # Google Search Console, Domain property csarko.sh (verified 2026-09-11).
    # Google re-checks it periodically; removing it un-verifies the property.
    "google-site-verification=r8DHgyFqGEsfamOeyKlLZecMwnv54ysXg91ZFGylr_4",
  ]

  # Non-apex hostnames CNAME straight to their site's own web.app host: the
  # redirect domains (www) to the public site, admin to the admin site.
  cname_records = merge(
    { for d in var.redirect_domain_names : d => local.hosting_cname_target },
    { (var.admin_domain_name) = local.admin_hosting_cname_target },
  )

  providers = {
    aws = aws
  }
}
