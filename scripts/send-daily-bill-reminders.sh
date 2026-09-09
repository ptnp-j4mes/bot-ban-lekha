#!/usr/bin/env bash

set -Eeuo pipefail

cron_env_file="${CRON_ENV_FILE:-/etc/bot-ban-lekha/cron.env}"
if [[ -f "$cron_env_file" ]]; then
  # Keep the API URL and job key out of the crontab and repository.
  source "$cron_env_file"
fi

: "${BILL_API_URL:?set BILL_API_URL in the cron environment}"
: "${INTERNAL_JOB_API_KEY:?set INTERNAL_JOB_API_KEY in the cron environment}"

curl --fail --silent --show-error --retry 3 --connect-timeout 10 --max-time 120 \
  --request POST \
  --header "x-job-key: ${INTERNAL_JOB_API_KEY}" \
  --header "content-type: application/json" \
  "${BILL_API_URL%/}/api/jobs/send-daily-bill-reminders" \
  --write-out "\n"
