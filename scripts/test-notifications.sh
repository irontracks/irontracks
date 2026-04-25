#!/usr/bin/env bash
# Manual notification testing helper.
#
# Reads CRON_SECRET + SITE_URL from your shell env (or you pass them in).
# Provides commands to:
#   1. Verify cron auth wiring (low-impact dry checks)
#   2. Trigger each cron individually
#   3. Trigger the per-type push test endpoint
#
# Get CRON_SECRET from Vercel:
#   Vercel → Project → Settings → Environment Variables → CRON_SECRET → Copy
# Or via CLI:
#   vercel env pull .env.production
#
# Usage:
#   chmod +x scripts/test-notifications.sh
#   export SITE_URL="https://app.irontracks.com.br"   # adjust to your prod domain
#   export CRON_SECRET="<paste from Vercel>"
#   ./scripts/test-notifications.sh menu

set -euo pipefail

: "${SITE_URL:?Set SITE_URL=https://your-domain — required}"
: "${CRON_SECRET:?Set CRON_SECRET=<value from Vercel> — required}"

H_AUTH=(-H "Authorization: Bearer ${CRON_SECRET}")
CMD="${1:-menu}"

# All 8 cron endpoints — paired with a "blast-radius" hint so you know what
# you're triggering before you fire.
CRONS=(
  "birthday|low|Only users whose anniversary is today"
  "trial-ending|low|Only users with VIP expiring in 24-48h, auto-renew off"
  "weekly-recap|medium|All users with workouts in the past week"
  "morning-briefing|low|Default-OFF preference; only opted-in users get push"
  "water-reminder|low|Default-OFF preference; only opted-in users get push"
  "inactivity-nudge|high|All users inactive for 3-7 days"
  "streak-at-risk|high|All users with streak ≥ 3 + no workout today"
  "friends-trained-today|high|Fan-out — every user whose followed friends trained"
)

list_crons() {
  echo ""
  echo "Crons available (key | blast | description):"
  printf '  %-25s %-7s %s\n' "KEY" "BLAST" "DESCRIPTION"
  for entry in "${CRONS[@]}"; do
    IFS='|' read -r key blast desc <<<"$entry"
    printf '  %-25s %-7s %s\n' "$key" "$blast" "$desc"
  done
  echo ""
}

trigger_cron() {
  local key="$1"
  echo ""
  echo "→ Triggering /api/cron/${key}"
  curl -sS "${H_AUTH[@]}" "${SITE_URL}/api/cron/${key}" | sed 's/^/  /'
  echo ""
}

trigger_safe_crons() {
  for entry in "${CRONS[@]}"; do
    IFS='|' read -r key blast _ <<<"$entry"
    if [[ "$blast" == "low" ]]; then
      trigger_cron "$key"
    fi
  done
}

trigger_all_crons() {
  echo "WARNING: this will fire push notifications to real users for high-blast crons."
  read -p "Type YES to continue: " confirm
  if [[ "$confirm" != "YES" ]]; then
    echo "Aborted."
    return
  fi
  for entry in "${CRONS[@]}"; do
    IFS='|' read -r key _ _ <<<"$entry"
    trigger_cron "$key"
  done
}

show_push_test_urls() {
  echo ""
  echo "Per-type push test (must be logged in as admin in your browser):"
  echo ""
  local types=(
    "story_comment" "mentioned_in_comment" "mentioned_in_chat"
    "pr_close" "birthday" "streak_at_risk" "inactivity"
    "morning_briefing" "weekly_recap" "friends_trained_today"
    "water_reminder" "trial_ending" "billing_issue"
    "friend_comeback" "friend_achievement" "friend_weekly_goal"
  )
  for t in "${types[@]}"; do
    echo "  ${SITE_URL}/api/push/test?type=${t}"
  done
  echo ""
  echo "Add &platform=all to also send to Android (FCM)."
  echo ""
}

case "$CMD" in
  menu)
    echo ""
    echo "test-notifications — IronTracks notification testing helper"
    echo ""
    echo "Sub-commands:"
    echo "  list                  — list crons + blast radius"
    echo "  trigger <key>         — fire a single cron (e.g. trigger birthday)"
    echo "  safe                  — fire only low-blast crons"
    echo "  all                   — fire ALL crons (asks confirmation)"
    echo "  push-urls             — print per-type push-test URLs"
    echo ""
    list_crons
    ;;
  list) list_crons ;;
  trigger)
    if [[ -z "${2:-}" ]]; then
      echo "Usage: $0 trigger <cron-key>"
      list_crons
      exit 1
    fi
    trigger_cron "$2"
    ;;
  safe) trigger_safe_crons ;;
  all) trigger_all_crons ;;
  push-urls) show_push_test_urls ;;
  *)
    echo "Unknown sub-command: $CMD"
    echo "Run '$0 menu' to see options."
    exit 1
    ;;
esac
