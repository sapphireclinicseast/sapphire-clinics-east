#!/usr/bin/env bash
# Tell somebody when bookings disappear.
#
# The decking sync can delete. That is deliberate — front desk clear a cell in
# the spreadsheet and the booking behind it goes — but it means a fault in the
# sync, or a misread sheet, removes children from a therapist's board silently.
#
# On 18 Nov 2026 thirty-seven bookings were deleted that way, including a
# doctor's entire 3 December clinic of fourteen children. Nothing failed,
# nothing was logged, and nobody noticed for two days; it surfaced only because
# somebody happened to open that one doctor's schedule.
#
# The deletion is hard to prevent outright without breaking the feature. Being
# told about it the next morning is not. This diffs last night's database dump
# against the one before it and reports every booking that vanished.
#
# Churn is filtered out. Front desk move children between slots constantly, and
# a slot row is deleted and recreated whenever a therapist's hours change, so a
# booking is only reported when that patient is no longer on that therapist's
# board AT ALL. What is left is the set nobody meant to lose.
#
# Install: /usr/local/bin/scei-decking-booking-reconcile.sh, run daily from
# cron AFTER the 02:00 dump. Reports through scei-alert.sh like every other
# alarm on this box.

set -uo pipefail

BACKUPS=/opt/sapphire/backups
ALERT=/usr/local/bin/scei-alert.sh
DB_CONTAINER=sapphire_db
DB_USER=sapphire
DB_NAME=sapphire_marketing
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# The two most recent nightly dumps — yesterday's state and today's. Two
# explicit paths may be given instead, which is how this gets tested against a
# known incident and how an older window is examined after the fact.
if [ $# -eq 2 ]; then
  OLD="$1"; NEW="$2"
  DRY_RUN=1
else
  mapfile -t DUMPS < <(ls -1 "$BACKUPS"/sapphire_[0-9]*_020001.sql.gz 2>/dev/null | sort | tail -2)
  if [ "${#DUMPS[@]}" -lt 2 ]; then
    echo "$(date -Is) need two nightly dumps to compare, found ${#DUMPS[@]} — nothing to do."
    exit 0
  fi
  OLD="${DUMPS[0]}"
  NEW="${DUMPS[1]}"
  DRY_RUN=0
fi

# One line per BOOKED slot: the identity of the appointment, not of the row.
# Keyed this way a slot that was deleted and recreated for the same child at
# the same hour is correctly seen as unchanged.
extract() {
  zcat "$1" \
    | awk '/^COPY public\."DeckingSlot"/,/^\\\.$/' \
    | grep -v '^COPY\|^\\\.$' \
    | awk -F'\t' '$3 != "\\N" { print $2"|"$3"|"$4"|"$5"|"$16 }' \
    | sort -u
}
extract "$OLD" > "$WORK/old.txt"
extract "$NEW" > "$WORK/new.txt"
comm -23 "$WORK/old.txt" "$WORK/new.txt" > "$WORK/gone.txt"

TOTAL=$(wc -l < "$WORK/gone.txt" | tr -d ' ')
[ "$TOTAL" = "0" ] && { echo "$(date -Is) no bookings disappeared between $(basename "$OLD") and $(basename "$NEW")."; exit 0; }

# Of those, keep only the ones where the child is no longer with that therapist
# at all. Everything else is an ordinary reschedule.
: > "$WORK/real.txt"
while IFS='|' read -r staff patient dow time date; do
  [ -z "${staff:-}" ] && continue
  still=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT count(*) FROM \"DeckingSlot\" WHERE \"staffId\"='$staff' AND \"patientId\"='$patient';" 2>/dev/null | tr -d ' ')
  [ "${still:-0}" != "0" ] && continue
  line=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT coalesce((SELECT \"lastName\"||', '||\"firstName\" FROM \"Patient\" WHERE id='$patient'),'(unknown patient)')
         ||'  with  '||coalesce((SELECT \"lastName\" FROM \"Staff\" WHERE id='$staff'),'(unknown staff)');" 2>/dev/null | sed 's/^ *//')
  when="$dow $time"
  [ "$date" != "\\N" ] && when="$(echo "$date" | cut -d' ' -f1) $time"
  printf '  %s   [%s]\n' "$line" "$when" >> "$WORK/real.txt"
done < "$WORK/gone.txt"

REAL=$(wc -l < "$WORK/real.txt" | tr -d ' ')
if [ "$REAL" = "0" ]; then
  echo "$(date -Is) $TOTAL booking row(s) changed, all still on their therapist's board — ordinary rescheduling, nothing lost."
  exit 0
fi

BODY="$REAL booking(s) present in $(basename "$OLD") are gone from $(basename "$NEW"),
and the child is no longer on that therapist's board at all.

$(sort "$WORK/real.txt")

Ordinary reschedules are filtered out — these are bookings that left without
arriving anywhere else, so they are either a deliberate cancellation or data
the sync dropped.

If they were not cancelled on purpose they can be restored from
$OLD — the rows are still in that dump."

echo "$(date -Is) ALERT: $REAL booking(s) vanished"
echo "$BODY"
if [ "$DRY_RUN" = "1" ]; then
  echo "(explicit dumps given — report printed, no alert sent)"
elif [ -x "$ALERT" ]; then
  "$ALERT" "[SCEI] $REAL decking booking(s) disappeared overnight" "$BODY"
fi
