# One active rule set, one rule: every address at the domain and its subdomains is accepted,
# scanned, stored under raw/ and handed to the Lambda (asynchronously; the Lambda never raises
# on a send it could not make, so SES's retries cannot duplicate a forward).

resource "aws_ses_receipt_rule_set" "this" {
  rule_set_name = local.rule_set
}

resource "aws_ses_active_receipt_rule_set" "this" {
  rule_set_name = aws_ses_receipt_rule_set.this.rule_set_name
}

resource "aws_ses_receipt_rule" "all" {
  name          = local.rule_name
  rule_set_name = aws_ses_receipt_rule_set.this.rule_set_name
  # "example.com" matches the domain's own addresses; ".example.com" every subdomain's.
  recipients   = [var.domain, ".${var.domain}"]
  enabled      = true
  scan_enabled = true
  tls_policy   = "Optional"

  s3_action {
    bucket_name       = aws_s3_bucket.mail.id
    object_key_prefix = "raw/"
    position          = 1
  }

  lambda_action {
    function_arn    = aws_lambda_function.inbound.arn
    invocation_type = "Event"
    position        = 2
  }

  depends_on = [aws_s3_bucket_policy.mail, aws_lambda_permission.ses, aws_sesv2_email_identity.domain]
}
