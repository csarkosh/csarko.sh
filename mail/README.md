# mail

The Lambda behind every address at csarko.sh. SES receives the message, stores the raw copy in
S3 under `raw/`, and invokes `inbound.handler`, which applies the alias's policy from DynamoDB and
forwards to the owner with the alias in `From:` and a reverse alias in `Reply-To:`, or sends the
owner's reply out as the alias.

- `lambda/mailkit.py`: the pure functions (recipients, policy, header rewriting, tokens).
- `lambda/store.py`: the table and the bucket.
- `lambda/inbound.py`: the handler.
- Tests: `python3 -m unittest discover -s mail/test -v` (no AWS, no boto3 needed).
- Infrastructure: `_infra/modules/aws-mail`. The skill that reads and sends mail is `mail` in
  csarkosh/skills-general.
- Design: `docs/superpowers/specs/2026-10-30-email-aliases-design.md`; plan:
  `docs/superpowers/plans/2026-10-30-email-aliases.md`.
