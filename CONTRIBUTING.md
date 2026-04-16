# Contributing

## Development

Install dependencies:

```bash
bun install
```

Run tests:

```bash
bun test
```

Build (type-check + compile):

```bash
bun run build
```

## Pull Request Requirements

All pull requests targeting `main` must pass the **CI / validate** status check before merging.

To enforce this, go to **Settings → Branches → Branch protection rules** for `main` and add
`CI / validate` (the job name from `.github/workflows/ci.yml`) as a required status check.

## Sync Workflow

Upstream plugins are synced on a weekly cron (every Monday 03:00 UTC). To change the cadence,
edit the `schedule` block in `.github/workflows/sync.yml` — switch between the weekly and daily
cron lines. The `schedule` input shown in the manual dispatch UI is informational only and does
not affect when the workflow runs automatically.

### Webhook Notifications

After a sync PR is created, optional webhook notifications can be sent by configuring repository
secrets:

- `SLACK_WEBHOOK_URL` — posts to a Slack incoming webhook
- `DISCORD_WEBHOOK_URL` — posts to a Discord webhook

Notification failures are non-fatal: they emit a warning but do not fail the workflow.
