# Sign-in for admin.csarko.sh: Firebase Authentication on the project, and the
# web app whose configuration the admin shell signs in with.
#
# The shell's /auth.js signs an account in with Google through Firebase Auth
# and sends the ID token to every app's admin routes, which verify it against
# Google's keys and their allowlist (admin/api/src/auth.mjs here; the game's
# server/src/adminAuth.ts). One sign-in for every app is the point: the game's
# own copy of this module went when its page moved here (2026-10-13). Nothing
# here costs anything: Google sign-in is free at any number of accounts.
#
# TWO STEPS ARE BY HAND. The Google sign-in provider needs an OAuth client,
# which the Firebase console creates when the provider is switched on and
# which no API or Terraform resource creates or edits. After the first apply:
# Firebase console → Authentication → Sign-in method → Google → Enable → Save;
# then Google Cloud console → APIs & Services → Credentials → that client →
# add https://admin.csarko.sh/__/auth/handler to its redirect URIs and
# https://admin.csarko.sh to its JavaScript origins, since the shell signs in
# on its own host (Firebase Hosting serves /__/auth/ there).

terraform {
  required_providers {
    google = {
      source = "hashicorp/google"
      # google.quota: the Identity Toolkit API refuses a user's own credentials
      # unless the call names a project to count its quota against; this alias
      # does (the root's main.tf says how).
      configuration_aliases = [google.quota]
    }
    google-beta = {
      source                = "hashicorp/google-beta"
      configuration_aliases = [google-beta.quota]
    }
  }
}

resource "google_project_service" "identitytoolkit" {
  project            = var.project_id
  service            = "identitytoolkit.googleapis.com"
  disable_on_destroy = false
}

# Firebase Auth, initialised, with the domains a sign-in may come from: the
# admin host, Firebase's own hostnames, and the local preview.
resource "google_identity_platform_config" "this" {
  provider = google.quota
  project  = var.project_id

  authorized_domains = concat(
    ["localhost", "${var.project_id}.firebaseapp.com", "${var.project_id}.web.app"],
    var.authorized_domains,
  )

  lifecycle {
    # The API reports an empty multi-tenant block the configuration never
    # declares; without this every plan would want to remove it.
    ignore_changes = [multi_tenant]
  }

  depends_on = [google_project_service.identitytoolkit]
}

# The web app: what gives the shell its API key. A Firebase web API key is not
# a secret: it names the project to Firebase and is sent by every page that
# signs in; the allowlist on each API is what guards the data.
resource "google_firebase_web_app" "admin" {
  provider     = google-beta
  project      = var.project_id
  display_name = "csarko.sh admin"

  deletion_policy = "DELETE"
}

data "google_firebase_web_app_config" "admin" {
  provider   = google-beta.quota
  project    = var.project_id
  web_app_id = google_firebase_web_app.admin.app_id
}
