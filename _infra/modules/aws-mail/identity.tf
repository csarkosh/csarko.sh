# Sending: the domain identity with Easy DKIM and a custom MAIL FROM (so SPF aligns for DMARC),
# the owner's address as an identity too (in the SES sandbox an account may only send to
# verified addresses; SES mails it a link to click), and one configuration set on every send,
# whose bounces and complaints go to the owner by email.

resource "aws_sesv2_configuration_set" "this" {
  configuration_set_name = var.name

  reputation_options {
    reputation_metrics_enabled = true
  }

  sending_options {
    sending_enabled = true
  }
}

resource "aws_sesv2_email_identity" "domain" {
  email_identity         = var.domain
  configuration_set_name = aws_sesv2_configuration_set.this.configuration_set_name

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

resource "aws_sesv2_email_identity_mail_from_attributes" "domain" {
  email_identity   = aws_sesv2_email_identity.domain.email_identity
  mail_from_domain = "bounce.${var.domain}"
  # If the bounce. MX ever fails to verify (the first minutes after apply, or a DNS hiccup), send
  # with SES's own MAIL FROM rather than refuse: DKIM alone still aligns for DMARC.
  behavior_on_mx_failure = "USE_DEFAULT_VALUE"
}

resource "aws_sesv2_email_identity" "owner" {
  email_identity = var.owner_address
}

resource "aws_sns_topic" "events" {
  name = "${var.name}-events"
}

data "aws_iam_policy_document" "events" {
  statement {
    sid       = "SESPublishesBouncesAndComplaints"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.events.arn]

    principals {
      type        = "Service"
      identifiers = ["ses.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceAccount"
      values   = [local.account]
    }
  }
}

resource "aws_sns_topic_policy" "events" {
  arn    = aws_sns_topic.events.arn
  policy = data.aws_iam_policy_document.events.json
}

# SNS mails a confirmation link; nothing arrives until the owner clicks it.
resource "aws_sns_topic_subscription" "owner" {
  topic_arn = aws_sns_topic.events.arn
  protocol  = "email"
  endpoint  = var.owner_address
}

resource "aws_sesv2_configuration_set_event_destination" "bounces" {
  configuration_set_name = aws_sesv2_configuration_set.this.configuration_set_name
  event_destination_name = "bounces-and-complaints"

  event_destination {
    enabled              = true
    matching_event_types = ["BOUNCE", "COMPLAINT"]

    sns_destination {
      topic_arn = aws_sns_topic.events.arn
    }
  }

  depends_on = [aws_sns_topic_policy.events]
}
