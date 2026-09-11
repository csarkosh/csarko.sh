terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

data "aws_route53_zone" "this" {
  name = var.zone_name
}

# The zone itself is not Terraform-managed, and neither is anything else in it:
# the apex MX records (Google Workspace mail), the fps repo's games/game CNAMEs,
# and the older project subdomains all live outside this state. This module owns
# exactly two record sets — the apex A and the apex TXT — and nothing more.

# allow_overwrite lets the first apply UPSERT over the apex A record the old
# AWS site left behind (an alias to its CloudFront distribution). That swap is
# the cutover: one atomic Route53 change, no window with no record at all.
resource "aws_route53_record" "a" {
  zone_id         = data.aws_route53_zone.this.zone_id
  name            = var.domain_name
  type            = "A"
  ttl             = var.ttl
  records         = var.a_records
  allow_overwrite = true
}

# A TXT record set at the apex is shared by every TXT value for the name. If
# anything else ever needs an apex TXT (SPF, another verification token), add
# it to txt_records here — a second record set would fight this one.
resource "aws_route53_record" "txt" {
  zone_id = data.aws_route53_zone.this.zone_id
  name    = var.domain_name
  type    = "TXT"
  ttl     = var.ttl
  records = var.txt_records
}
