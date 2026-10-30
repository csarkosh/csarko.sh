# The raw messages (raw/ as received, sent/ as sent) and the table that indexes them, holds the
# aliases and maps reverse-alias tokens to their pairs (spec section 6).

resource "aws_s3_bucket" "mail" {
  bucket = local.bucket
}

resource "aws_s3_bucket_public_access_block" "mail" {
  bucket                  = aws_s3_bucket.mail.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "mail" {
  bucket = aws_s3_bucket.mail.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "mail" {
  bucket = aws_s3_bucket.mail.id

  dynamic "rule" {
    for_each = ["raw/", "sent/"]

    content {
      id     = "expire-${trimsuffix(rule.value, "/")}"
      status = "Enabled"

      filter {
        prefix = rule.value
      }

      expiration {
        days = var.retention_days
      }
    }
  }
}

# The shape SES's receiving guide gives: only this account's receipt rule may write, and only
# under raw/.
data "aws_iam_policy_document" "bucket" {
  statement {
    sid       = "AllowSESPuts"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.mail.arn}/raw/*"]

    principals {
      type        = "Service"
      identifiers = ["ses.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceAccount"
      values   = [local.account]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [local.rule_arn]
    }
  }
}

resource "aws_s3_bucket_policy" "mail" {
  bucket     = aws_s3_bucket.mail.id
  policy     = data.aws_iam_policy_document.bucket.json
  depends_on = [aws_s3_bucket_public_access_block.mail]
}

# One table, on demand. No pair index: the pair item (PAIR#<hash>) is read with a consistent
# get, so two first messages from one correspondent agree on one token (the plan's by-pair GSI
# was eventually consistent; ledger, pre-flight ruling).
resource "aws_dynamodb_table" "mail" {
  name         = var.name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "message_id"
    type = "S"
  }

  global_secondary_index {
    name            = "by-id"
    hash_key        = "message_id"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expires"
    enabled        = true
  }
}

# The protected aliases exist from the start. Runtime changes (counts, a name, a note) are the
# Lambda's and the skill's, so Terraform writes each row once and then leaves it alone.
resource "aws_dynamodb_table_item" "protected" {
  for_each = toset(local.protected)

  table_name = aws_dynamodb_table.mail.name
  hash_key   = aws_dynamodb_table.mail.hash_key
  range_key  = aws_dynamodb_table.mail.range_key

  item = jsonencode({
    pk            = { S = "ALIAS#${each.value}" }
    sk            = { S = "ALIAS" }
    local         = { S = each.value }
    state         = { S = each.value == "dmarc" ? "archive" : "forward" }
    created       = { S = "2026-10-30T00:00:00+00:00" }
    first_from    = { S = "" }
    last_seen     = { S = "2026-10-30T00:00:00+00:00" }
    count         = { N = "0" }
    count_blocked = { N = "0" }
    protected     = { BOOL = true }
    note = { S = contains(["postmaster", "abuse"], each.value) ? "RFC 2142" : (
      each.value == "dmarc" ? "DMARC aggregate reports, archived" : "protected by mail_protected_aliases"
    ) }
  })

  lifecycle {
    ignore_changes = [item]
  }
}
