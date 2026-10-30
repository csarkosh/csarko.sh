output "table_name" { value = aws_dynamodb_table.mail.name }
output "bucket" { value = aws_s3_bucket.mail.id }
output "function_name" { value = aws_lambda_function.inbound.function_name }
output "configuration_set" { value = aws_sesv2_configuration_set.this.configuration_set_name }
output "region" { value = local.region }
output "skill_policy_arn" { value = aws_iam_policy.skill.arn }

output "apex_spf_value" {
  description = "The SPF value for the apex TXT record set (owned by aws-dns)."
  value       = local.apex_spf
}

output "owner_identity_verified" {
  description = "Whether the owner clicked SES's verification link (needed while the account is in the SES sandbox)."
  value       = aws_sesv2_email_identity.owner.verified_for_sending_status
}

output "domain_identity_verified" {
  value = aws_sesv2_email_identity.domain.verified_for_sending_status
}
