#!/bin/bash
# upload_to_slack.sh — Upload a file to a Slack channel via files.upload API
# Usage: ./upload_to_slack.sh <file_path> [initial_comment]
#
# Requires environment variables:
#   SLACK_BOT_TOKEN  — xoxb-... Bot User OAuth Token
#   SLACK_CHANNEL_ID — Channel ID (e.g., C0501F6DJ57)
#
# The bot token needs 'files:write' scope.
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
  echo "Error: No file path provided" >&2
  echo "Usage: $0 <file_path> [initial_comment]" >&2
  exit 1
fi

FILE_PATH="$1"
COMMENT="${2:-}"

if [ ! -f "$FILE_PATH" ]; then
  echo "Error: File not found: $FILE_PATH" >&2
  exit 1
fi

FILENAME=$(basename "$FILE_PATH")

# Step 1: Get upload URL
LENGTH=$(wc -c < "$FILE_PATH" | tr -d ' ')

UPLOAD_URL_RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-type: application/json; charset=utf-8" \
  --data "{\"filename\": \"$FILENAME\", \"length\": $LENGTH}" \
  "https://slack.com/api/files.getUploadURLExternal")

OK=$(echo "$UPLOAD_URL_RESPONSE" | jq -r '.ok')
if [ "$OK" != "true" ]; then
  ERROR=$(echo "$UPLOAD_URL_RESPONSE" | jq -r '.error // "unknown error"')
  echo "Error: files.getUploadURLExternal failed: $ERROR" >&2
  exit 1
fi

UPLOAD_URL=$(echo "$UPLOAD_URL_RESPONSE" | jq -r '.upload_url')
FILE_ID=$(echo "$UPLOAD_URL_RESPONSE" | jq -r '.file_id')

# Step 2: Upload file content
UPLOAD_RESPONSE=$(curl -s -X POST \
  -F "file=@$FILE_PATH" \
  "$UPLOAD_URL")

# Step 3: Complete upload and share to channel
COMPLETE_PAYLOAD=$(jq -n \
  --arg channel "$SLACK_CHANNEL_ID" \
  --arg file_id "$FILE_ID" \
  --arg title "$FILENAME" \
  --arg comment "$COMMENT" \
  '{
    files: [{id: $file_id, title: $title}],
    channel_id: $channel,
    initial_comment: $comment
  }')

COMPLETE_RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-type: application/json; charset=utf-8" \
  --data "$COMPLETE_PAYLOAD" \
  "https://slack.com/api/files.completeUploadExternal")

OK=$(echo "$COMPLETE_RESPONSE" | jq -r '.ok')
if [ "$OK" = "true" ]; then
  echo "Uploaded '$FILENAME' successfully"
else
  ERROR=$(echo "$COMPLETE_RESPONSE" | jq -r '.error // "unknown error"')
  echo "Error: files.completeUploadExternal failed: $ERROR" >&2
  exit 1
fi
