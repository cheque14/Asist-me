# Notify appointment counterparts reliably

Apply `migrations/013_appointment_notifications.sql` to the **intended database**
after 011, and after 012 when using clinical records. Review and back up first;
test in an isolated staging database. This agent has not connected to Supabase
or executed the migration. Run the whole transaction, not selected fragments.

## Delivery rules

| Successful action | Recipient |
| --- | --- |
| Patient books or requests another date/doctor | Current physician who must respond |
| Physician schedules an existing patient's appointment | Patient account |
| Physician confirms, rejects, cancels, completes or returns an appointment to pending | Patient account |
| Patient cancels | Assigned physician |
| Physician proposes another time | Patient account |
| Patient accepts, rejects or counteroffers | Physician |
| Physician accepts/rejects a patient request or counteroffer | Patient account |
| Accepted transfer to another physician | Newly assigned physician, plus affected counterpart |

The actor does not receive their own notification. Multiple roles resolving to
the same account receive only one copy. Status writes that do not change the
state send nothing. Unauthorized, unavailable, stale or otherwise rejected
mutations do not send success notifications.

## Transaction and privacy boundaries

One SQL helper owns notification inserts. The existing safe workflow functions
call it inside their mutation transaction; an insert failure rolls back both the
action and its notification. Doctor proposals suppress their nested patient-
request event transaction-locally, then send only the final doctor proposal.
Acceptance sends one combined event rather than separate acceptance/status
copies. Existing creation triggers are reused, not duplicated.

Recipients and actor ownership come from database relationships. Notification
text includes the action and clinic-zone date/time, not clinical notes, reasons,
diagnoses or beneficiary phone numbers. Profile edits and protected clinical
record changes are outside this appointment-only feature. Existing clinical
access restrictions remain unchanged. No old events are retroactively backfilled.

Initial creation actor follows the canonical API: patient-created appointments
start `pendiente`; physician-created appointments start `confirmada`. A direct
administrative SQL insert outside that convention is not an authenticated app
action. Adapt this contract before adding other creation paths.

Local actions refresh the bell and pending-response indicators. Other open
sessions continue using their existing polling (notification inbox/bell: up to
30 seconds); this feature does not add a push/WebSocket service.

## Verification

```powershell
python -B -m unittest backend.tests.test_appointment_notifications
```

Frontend regressions cover successful booking, cancellation, requests and all
patient proposal responses, plus absence of refresh announcements on failure.
The Python checks inspect SQL structure and ownership of event emission;
**they do not execute PostgreSQL or prove live privileges/atomicity**.

Before production, verify every table row above using separate patient/physician
accounts in staging; check one new unread row per recipient, actor exclusion,
linked appointment details and accepted-transfer delivery. Repeat a same-state
request and a resolved proposal to confirm no extra notifications. Force an
insert failure inside a test transaction and confirm neither the mutation nor
its message persists. Verify anonymous/authenticated roles cannot execute the
helper or privileged mutation functions. Verify rerunning 013 adds no duplicates.
