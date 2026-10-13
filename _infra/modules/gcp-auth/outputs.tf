output "web_api_key" {
  description = "The web app's Firebase API key, baked into the admin shell's auth-config.json. Not a secret: it names the project."
  value       = data.google_firebase_web_app_config.admin.api_key
}

output "web_app_id" {
  description = "The Firebase web app's id"
  value       = google_firebase_web_app.admin.app_id
}
