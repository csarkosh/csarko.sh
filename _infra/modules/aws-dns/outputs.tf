output "fqdn" {
  description = "The apex record's fully qualified name"
  value       = aws_route53_record.a.fqdn
}
