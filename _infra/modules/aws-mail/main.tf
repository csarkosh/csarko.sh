# Every address at the domain, received by Amazon SES and handled by one Lambda: forwarded to
# the owner with the alias in From and a reverse alias in Reply-To, or archived, or dropped; and
# the owner's replies to a reverse alias sent back out as the alias.
#
# Design: docs/superpowers/specs/2026-10-30-email-aliases-design.md. The Lambda's code is
# mail/lambda; the skill that reads and sends is `mail` in csarkosh/skills-general.
#
# What it costs: nothing while idle. SES bills $0.10 per 1,000 messages received (plus $0.09 per
# 1,000 chunks of 256 KB) and $0.10 per 1,000 sent; Lambda, DynamoDB on-demand and SNS stay in
# their free tiers at a personal domain's volume; S3 is cents a year. The Route 53 zone is
# already paid for.
#
# Everything regional is in the provider's region (us-east-2, where SES receives mail). Route 53
# is global and is reached through the same provider.

terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
    archive = {
      source = "hashicorp/archive"
    }
  }
}

data "aws_caller_identity" "this" {}
data "aws_region" "this" {}

locals {
  account   = data.aws_caller_identity.this.account_id
  region    = data.aws_region.this.name
  rule_set  = var.name
  rule_name = "${var.name}-all"
  # Built from names, not from the rule resource: SES checks the bucket policy and the Lambda
  # permission when the rule is created, so both must exist first and cannot depend on it.
  rule_arn = "arn:aws:ses:${local.region}:${local.account}:receipt-rule-set/${local.rule_set}:receipt-rule/${local.rule_name}"
  bucket   = "${replace(var.domain, ".", "-")}-${var.name}"
  inbound  = "inbound-smtp.${local.region}.amazonaws.com"
  feedback = "feedback-smtp.${local.region}.amazonses.com"
  spf_ses  = "v=spf1 include:amazonses.com -all"
  # Google stays in the apex SPF until the Workspace subscription that can still send as the
  # domain is cancelled (spec section 4, the builder check's first question).
  apex_spf  = var.cutover_complete ? local.spf_ses : "v=spf1 include:amazonses.com include:_spf.google.com -all"
  protected = distinct(concat(["postmaster", "abuse", "dmarc"], var.protected_aliases))
}
