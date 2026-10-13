terraform {
  required_providers {
    google = {
      source = "hashicorp/google"
    }
    google-beta = {
      source = "hashicorp/google-beta"
    }
  }
}

# The project-level pieces (the two APIs and Firebase itself) exist once per
# project, however many Hosting sites it carries. The first instance of this
# module (the public site) owns them; the admin instance sets manage_project
# false and depends on the first, so two instances never fight over one
# resource. These were plain resources until the admin site arrived
# (2026-10-12); the moved blocks keep the public site's state where it is.
resource "google_project_service" "firebase" {
  count = var.manage_project ? 1 : 0

  project            = var.project_id
  service            = "firebase.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "firebasehosting" {
  count = var.manage_project ? 1 : 0

  project            = var.project_id
  service            = "firebasehosting.googleapis.com"
  disable_on_destroy = false
}

resource "google_firebase_project" "this" {
  count = var.manage_project ? 1 : 0

  provider = google-beta
  project  = var.project_id

  depends_on = [google_project_service.firebase]
}

moved {
  from = google_project_service.firebase
  to   = google_project_service.firebase[0]
}

moved {
  from = google_project_service.firebasehosting
  to   = google_project_service.firebasehosting[0]
}

moved {
  from = google_firebase_project.this
  to   = google_firebase_project.this[0]
}

resource "google_firebase_hosting_site" "this" {
  provider = google-beta
  project  = var.project_id
  site_id  = var.site_id

  depends_on = [
    google_firebase_project.this,
    google_project_service.firebasehosting,
  ]
}

resource "google_firebase_hosting_custom_domain" "this" {
  provider      = google-beta
  project       = var.project_id
  site_id       = google_firebase_hosting_site.this.site_id
  custom_domain = var.domain_name

  # The certificate cannot issue until DNS points here, and DNS is created
  # after this resource — so waiting would deadlock the first apply.
  wait_dns_verification = false

  cert_preference = "GROUPED"
}

# Extra hostnames (e.g. www) that exist only to 301 to domain_name, path and
# query preserved. Firebase serves the redirect itself, with its own cert.
# An empty list (the admin site) creates none.
resource "google_firebase_hosting_custom_domain" "redirect" {
  for_each = toset(var.redirect_domain_names)

  provider        = google-beta
  project         = var.project_id
  site_id         = google_firebase_hosting_site.this.site_id
  custom_domain   = each.value
  redirect_target = var.domain_name

  wait_dns_verification = false
  cert_preference       = "GROUPED"

  depends_on = [google_firebase_hosting_custom_domain.this]
}
