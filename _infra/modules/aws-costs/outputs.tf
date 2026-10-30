output "role_arn" {
  description = "ARN of the Cost Explorer role; the admin API's AWS_COST_ROLE_ARN"
  value       = aws_iam_role.costs.arn
}

output "audience" {
  description = "The audience the role's trust policy accepts; the admin API's AWS_COST_AUDIENCE"
  value       = var.audience
}
