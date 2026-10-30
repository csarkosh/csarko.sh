# The AWS side of the admin dashboard's Finance page: one IAM role the admin API's
# Cloud Run service assumes to read Cost Explorer, and nothing else. Design:
# docs/superpowers/specs/2026-10-29-finance-admin-page-design.md, section 6.
#
# Nothing long-lived is stored anywhere. There is no IAM user, no access key and
# no secret: the Cloud Run service asks the metadata server for a Google ID token
# for its own service account (csarko-admin@csarko-sh.iam.gserviceaccount.com)
# with var.audience as the token's audience, and calls
# sts:AssumeRoleWithWebIdentity with it. STS checks Google's signature, that the
# token's `aud` is the audience and its `sub` is that service account's unique id,
# and answers with credentials that live an hour. Rotating is nothing: every call
# starts from a fresh token, and a leaked token is good for one hour of reading two
# Cost Explorer reports and nothing else.
#
# What it costs: Cost Explorer bills $0.01 a request. The collector makes two a
# day, so about $0.60 a month; the role itself is free.

terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

# Who may become the role: Google's OIDC provider is built into IAM
# (accounts.google.com needs no aws_iam_openid_connect_provider), so the whole
# trust is two string conditions on the token's claims. Both must hold: the
# audience alone would let any Google service account that minted a token for
# this audience in, and the subject alone would let a token meant for some other
# relying party be replayed here.
data "aws_iam_policy_document" "trust" {
  statement {
    sid     = "GoogleServiceAccountWebIdentity"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = ["accounts.google.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "accounts.google.com:aud"
      values   = [var.audience]
    }

    condition {
      test     = "StringEquals"
      variable = "accounts.google.com:sub"
      values   = [var.service_account_unique_id]
    }
  }
}

resource "aws_iam_role" "costs" {
  name                 = var.role_name
  description          = "Read-only Cost Explorer access for the csarko.sh admin API (Finance page), assumed with a Google ID token; no stored credentials."
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  max_session_duration = 3600
}

# What the role may do: the two Cost Explorer reads the Finance page draws
# (month to date and last month, and the forecast). Cost Explorer has no
# resource-level permissions, so the resource is `*` by necessity, not breadth;
# the actions are the fence.
data "aws_iam_policy_document" "costs" {
  statement {
    sid    = "CostExplorerRead"
    effect = "Allow"
    actions = [
      "ce:GetCostAndUsage",
      "ce:GetCostForecast",
    ]
    resources = ["*"]
  }
}

# Inline, so the policy lives and dies with the role and nothing else can
# attach it.
resource "aws_iam_role_policy" "costs" {
  name   = "cost-explorer-read"
  role   = aws_iam_role.costs.id
  policy = data.aws_iam_policy_document.costs.json
}
