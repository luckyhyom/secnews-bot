#!/bin/bash
# post_to_slack.sh — Post a JSON payload to Slack via Incoming Webhook
# Usage: ./post_to_slack.sh '{"text": "Hello, world!"}'

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env file not found at $ENV_FILE" >&2
  exit 1
fi

WEBHOOK_URL=$(grep '^SLACK_WEBHOOK_URL=' "$ENV_FILE" | cut -d'=' -f2-)

if [ -z "$WEBHOOK_URL" ]; then
  echo "Error: SLACK_WEBHOOK_URL not set in .env" >&2
  exit 1
fi

if [ $# -eq 0 ]; then
  echo "Error: No payload provided" >&2
  echo "Usage: $0 '{\"text\": \"message\"}'" >&2
  exit 1
fi

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H 'Content-type: application/json' \
  --data "$1" \
  "$WEBHOOK_URL")

if [ "$RESPONSE" = "200" ]; then
  echo "Posted successfully"
else
  echo "Error: Slack returned HTTP $RESPONSE" >&2
  exit 1
fi
