# The handler (mail/lambda), its role, and the policy a person's profile can carry to use the
# `mail` skill. Python 3.13 on arm64, boto3 from the runtime: three files, no layers.

data "archive_file" "inbound" {
  type        = "zip"
  output_path = "${path.module}/.build/inbound.zip"

  dynamic "source" {
    for_each = ["inbound.py", "mailkit.py", "store.py"]

    content {
      content  = file("${var.lambda_source_dir}/${source.value}")
      filename = source.value
    }
  }
}

data "aws_iam_policy_document" "lambda_trust" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.name}-inbound"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_cloudwatch_log_group" "inbound" {
  name              = "/aws/lambda/${var.name}-inbound"
  retention_in_days = 30
}

# Sending is limited to addresses at the domain; the table and the bucket are the only state.
data "aws_iam_policy_document" "lambda" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.inbound.arn}:*"]
  }

  statement {
    sid       = "Messages"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.mail.arn}/raw/*", "${aws_s3_bucket.mail.arn}/sent/*"]
  }

  statement {
    sid       = "Table"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query"]
    resources = [aws_dynamodb_table.mail.arn, "${aws_dynamodb_table.mail.arn}/index/*"]
  }

  statement {
    sid       = "SendAsTheDomain"
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = ["*"]

    condition {
      test     = "StringLike"
      variable = "ses:FromAddress"
      values   = ["*@${var.domain}"]
    }
  }
}

resource "aws_iam_role_policy" "lambda" {
  name   = "${var.name}-inbound"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda.json
}

resource "aws_lambda_function" "inbound" {
  function_name    = "${var.name}-inbound"
  role             = aws_iam_role.lambda.arn
  runtime          = "python3.13"
  architectures    = ["arm64"]
  handler          = "inbound.handler"
  filename         = data.archive_file.inbound.output_path
  source_code_hash = data.archive_file.inbound.output_base64sha256
  memory_size      = 256
  timeout          = 60

  environment {
    variables = {
      MAIL_DOMAIN         = var.domain
      MAIL_OWNER          = var.owner_address
      MAIL_BUCKET         = aws_s3_bucket.mail.id
      MAIL_TABLE          = aws_dynamodb_table.mail.name
      MAIL_CONFIG_SET     = aws_sesv2_configuration_set.this.configuration_set_name
      MAIL_RETENTION_DAYS = tostring(var.retention_days)
    }
  }

  depends_on = [aws_cloudwatch_log_group.inbound, aws_iam_role_policy.lambda]
}

resource "aws_lambda_permission" "ses" {
  statement_id   = "AllowSESInvoke"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.inbound.function_name
  principal      = "ses.amazonaws.com"
  source_account = local.account
  source_arn     = local.rule_arn
}

# For the `mail` skill: read everything, write sent/ and the table, send as the domain, and
# invoke the handler for `mail forward`. Created, not attached: a profile that uses the skill
# attaches it (spec section 7).
data "aws_iam_policy_document" "skill" {
  statement {
    sid       = "ReadMessages"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.mail.arn}/*"]
  }

  statement {
    sid       = "WriteSent"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.mail.arn}/sent/*"]
  }

  statement {
    sid       = "Table"
    actions   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:Scan", "dynamodb:PutItem", "dynamodb:UpdateItem"]
    resources = [aws_dynamodb_table.mail.arn, "${aws_dynamodb_table.mail.arn}/index/*"]
  }

  statement {
    sid       = "SendAsTheDomain"
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = ["*"]

    condition {
      test     = "StringLike"
      variable = "ses:FromAddress"
      values   = ["*@${var.domain}"]
    }
  }

  statement {
    sid       = "Status"
    actions   = ["ses:GetAccount"]
    resources = ["*"]
  }

  statement {
    sid       = "Reforward"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.inbound.arn]
  }
}

resource "aws_iam_policy" "skill" {
  name        = "${var.name}-skill"
  description = "What the mail skill needs: read the ${var.domain} mail, send as its aliases, re-run a forward."
  policy      = data.aws_iam_policy_document.skill.json
}
