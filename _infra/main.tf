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
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
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

# Mail: SES receives mail only in some regions; us-east-2 is one, and the account's default.
provider "aws" {
  alias  = "mail"
  region = var.mail_region
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

# The apps site, https://apps.csarko.sh: a third Hosting site in the project. It carries
# each released app's page (apps/build.mjs builds them from the app's README and latest
# release), and firebase.json redirects its "/" to https://csarko.sh/apps, as
# games.csarko.sh's "/" goes to /games. Deploys on its own (apps/deploy.sh).
module "gcp_hosting_apps" {
  source = "./modules/gcp-hosting"

  project_id            = var.gcp_project_id
  site_id               = var.apps_hosting_site_id
  domain_name           = var.apps_domain_name
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

  # The donate site's origin: the prices bucket's CORS names it, and DONATE_URL is where the
  # admin API sends a reader to look at what it published.
  donate_origin = "https://${var.donate_domain_name}"

  # The Finance page's AWS side (module aws_costs below). The two modules refer
  # to each other, which is fine: Terraform's graph is per resource, and the
  # service account the role trusts does not depend on the service that reads
  # the role's ARN, so there is no cycle.
  aws_cost_role_arn = module.aws_costs.role_arn
  aws_cost_audience = module.aws_costs.audience

  providers = {
    google         = google
    google.billing = google.billing
    google-beta    = google-beta
  }
}

# The Finance page's AWS costs: one IAM role the admin API assumes with a Google
# ID token for its own service account (no key, nothing stored), allowed two
# Cost Explorer reads. The audience is an identifier under the admin site, not
# a URL that serves anything; it is set here so the role and the service agree
# on the one string. The root's AWS provider (Route 53) serves it: IAM is global.
module "aws_costs" {
  source = "./modules/aws-costs"

  audience                  = "https://${var.admin_domain_name}/aws-costs"
  service_account_unique_id = module.gcp_admin_api.service_account_unique_id

  providers = {
    aws = aws
  }
}

# The donate site, https://donate.csarko.sh (Buy Me Tokens; design:
# docs/superpowers/specs/2026-10-30-donate-site-design.md): a fourth Hosting site in the
# project. It is static, with no rewrite and no redirect, and reads its prices from the
# public bucket in module gcp_admin_api (donate_prices_bucket) with a request the CSP allows
# for that one origin. It deploys on its own, apart from the other sites.
module "gcp_hosting_donate" {
  source = "./modules/gcp-hosting"

  project_id            = var.gcp_project_id
  site_id               = var.donate_hosting_site_id
  domain_name           = var.donate_domain_name
  redirect_domain_names = []
  manage_project        = false

  providers = {
    google      = google
    google-beta = google-beta
  }

  depends_on = [module.gcp_hosting]
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

  project_id      = var.gcp_project_id
  region          = var.gcp_region
  origins         = ["https://${var.domain_name}"]
  dataset         = local.visits_dataset
  history_dataset = local.visits_history_dataset
  # Hosting's rewrite and Cloud Run's frontend: confirmed 2026-10-15 with --log-ip through
  # https://csarko.sh/v (at 1 the collector saw a Google edge address, at 2 the caller's).
  trusted_proxies              = 2
  ignore_ips                   = var.visits_ignore_ips
  reader_service_account_email = module.gcp_admin_api.service_account_email

  providers = {
    google      = google
    google-beta = google-beta
  }

  # The admin module enables run, secretmanager and iam; this module only adds logging and bigquery.
  depends_on = [module.gcp_admin_api]
  # Arkos IDE's reports and its daily update check, which is redirected to the manifest on GitHub.
  apps = ["arkos=https://github.com/csarkosh/ide-arkos/releases/latest/download/manifest.json"]
}

# Each site's own hostname, e.g. "csarko-sh.web.app". default_url stays populated
# for the life of the site, unlike required_dns_updates, which empties once a
# domain reconciles (the fps repo learned this the hard way).
locals {
  hosting_cname_target        = trimprefix(module.gcp_hosting.default_url, "https://")
  admin_hosting_cname_target  = trimprefix(module.gcp_hosting_admin.default_url, "https://")
  apps_hosting_cname_target   = trimprefix(module.gcp_hosting_apps.default_url, "https://")
  donate_hosting_cname_target = trimprefix(module.gcp_hosting_donate.default_url, "https://")
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
    # SPF for mail from the domain (module aws_mail): SES, plus Google until the Workspace
    # subscription is gone (mail_cutover_complete).
    module.aws_mail.apex_spf_value,
  ]

  # Non-apex hostnames CNAME straight to their site's own web.app host: the
  # redirect domains (www) to the public site, admin to the admin site, apps to the apps site, donate to the donate site.
  cname_records = merge(
    { for d in var.redirect_domain_names : d => local.hosting_cname_target },
    { (var.admin_domain_name) = local.admin_hosting_cname_target },
    { (var.apps_domain_name) = local.apps_hosting_cname_target },
    { (var.donate_domain_name) = local.donate_hosting_cname_target },
  )

  providers = {
    aws = aws
  }
}

# Every address at the domain: SES receives, a Lambda forwards to the owner or sends the owner's
# reply as the alias. Design: docs/superpowers/specs/2026-10-30-email-aliases-design.md. The
# cutover is three variables, in order: the trial subdomain first, then mail_manage_apex_mx, and
# mail_cutover_complete once the Workspace subscription is cancelled (spec section 8).
module "aws_mail" {
  source = "./modules/aws-mail"

  domain            = var.domain_name
  zone_name         = var.dns_zone_name
  owner_address     = var.mail_owner_address
  lambda_source_dir = "${path.root}/../mail/lambda"
  retention_days    = var.mail_retention_days
  protected_aliases = var.mail_protected_aliases
  manage_apex_mx    = var.mail_manage_apex_mx
  apex_mx_rollback  = var.mail_apex_mx_rollback
  trial_subdomain   = var.mail_trial_subdomain
  cutover_complete  = var.mail_cutover_complete

  providers = {
    aws = aws.mail
  }
}
