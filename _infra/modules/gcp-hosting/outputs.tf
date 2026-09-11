output "site_id" {
  description = "Firebase Hosting site id"
  value       = google_firebase_hosting_site.this.site_id
}

output "default_url" {
  description = "The site's own firebaseapp/web.app URL"
  value       = google_firebase_hosting_site.this.default_url
}

output "required_dns_updates" {
  description = "Pending DNS records Firebase still wants for this custom domain. Empty once reconciled."
  value       = google_firebase_hosting_custom_domain.this.required_dns_updates
}

output "redirect_domain_states" {
  description = "Host, ownership and certificate state of each redirect-only custom domain"
  value = {
    for d, r in google_firebase_hosting_custom_domain.redirect : d => {
      host_state      = r.host_state
      ownership_state = r.ownership_state
      cert_state      = try(r.cert[0].state, null)
    }
  }
}

output "custom_domain_state" {
  description = "Host, ownership and certificate state of the custom domain"
  value = {
    host_state      = google_firebase_hosting_custom_domain.this.host_state
    ownership_state = google_firebase_hosting_custom_domain.this.ownership_state
    cert_state      = try(google_firebase_hosting_custom_domain.this.cert[0].state, null)
  }
}
