#!/bin/bash
# post_to_slack.sh — Post a message to Slack via Bot Token API (chat.postMessage)
# Usage: ./post_to_slack.sh "message text"
#
# Requires environment variables:
#   SLACK_BOT_TOKEN  — xoxb-... Bot User OAuth Token
#   SLACK_CHANNEL_ID — Channel ID (e.g., C0501F6DJ57)
#
# Falls back to reading from .env if env vars are not set.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env"

# Load from .env if env vars not already set
if [ -z "${SLACK_BOT_TOKEN:-}" ] && [ -f "$ENV_FILE" ]; then
  SLACK_BOT_TOKEN=$(grep '^SLACK_BOT_TOKEN=' "$ENV_FILE" | cut -d'=' -f2-)
fi
if [ -z "${SLACK_CHANNEL_ID:-}" ] && [ -f "$ENV_FILE" ]; then
  SLACK_CHANNEL_ID=$(grep '^SLACK_CHANNEL_ID=' "$ENV_FILE" | cut -d'=' -f2-)
fi

if [ -z "${SLACK_BOT_TOKEN:-}" ]; then
  echo "Error: SLACK_BOT_TOKEN not set" >&2
  exit 1
fi
if [ -z "${SLACK_CHANNEL_ID:-}" ]; then
  echo "Error: SLACK_CHANNEL_ID not set" >&2
  exit 1
fi

if [ $# -eq 0 ]; then
  echo "Error: No message provided" >&2
  echo "Usage: $0 \"message text\"" >&2
  exit 1
fi

PAYLOAD=$(jq -n \
  --arg channel "$SLACK_CHANNEL_ID" \
  --arg text "$1" \
  '{channel: $channel, text: $text}')

RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-type: application/json; charset=utf-8" \
  --data "$PAYLOAD" \
  "https://slack.com/api/chat.postMessage")

OK=$(echo "$RESPONSE" | jq -r '.ok')

if [ "$OK" = "true" ]; then
  echo "Posted successfully"
else
  ERROR=$(echo "$RESPONSE" | jq -r '.error // "unknown error"')
  echo "Error: Slack API returned: $ERROR" >&2
  exit 1
fi
