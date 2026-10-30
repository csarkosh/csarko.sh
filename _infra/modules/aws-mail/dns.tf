# The domain's mail records (spec section 4). The apex MX exists before this module and is in no
# state: manage_apex_mx takes it over with one UPSERT, the way aws-dns took over the apex A.
# The apex SPF is not here: the apex TXT is one record set, owned by aws-dns, so this module
# hands its value out (apex_spf_value) and the root adds it to that list.

data "aws_route53_zone" "this" {
  name = var.zone_name
}

resource "aws_route53_record" "apex_mx" {
  count = var.manage_apex_mx ? 1 : 0

  zone_id         = data.aws_route53_zone.this.zone_id
  name            = var.domain
  type            = "MX"
  ttl             = 300
  records         = var.apex_mx_rollback ? var.rollback_mx : ["10 ${local.inbound}"]
  allow_overwrite = true
}

resource "aws_route53_record" "trial_mx" {
  count = var.trial_subdomain != "" ? 1 : 0

  zone_id = data.aws_route53_zone.this.zone_id
  name    = "${var.trial_subdomain}.${var.domain}"
  type    = "MX"
  ttl     = 300
  records = ["10 ${local.inbound}"]
}

resource "aws_route53_record" "dkim" {
  count = 3

  zone_id = data.aws_route53_zone.this.zone_id
  name    = "${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}._domainkey.${var.domain}"
  type    = "CNAME"
  ttl     = 300
  records = ["${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"]
}

resource "aws_route53_record" "mail_from_mx" {
  zone_id = data.aws_route53_zone.this.zone_id
  name    = aws_sesv2_email_identity_mail_from_attributes.domain.mail_from_domain
  type    = "MX"
  ttl     = 300
  records = ["10 ${local.feedback}"]
}

resource "aws_route53_record" "mail_from_txt" {
  zone_id = data.aws_route53_zone.this.zone_id
  name    = aws_sesv2_email_identity_mail_from_attributes.domain.mail_from_domain
  type    = "TXT"
  ttl     = 300
  records = [local.spf_ses]
}

resource "aws_route53_record" "dmarc" {
  zone_id = data.aws_route53_zone.this.zone_id
  name    = "_dmarc.${var.domain}"
  type    = "TXT"
  ttl     = 300
  records = ["v=DMARC1; p=${var.cutover_complete ? "quarantine" : "none"}; rua=mailto:dmarc@${var.domain}"]
}
