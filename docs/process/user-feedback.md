# User Feedback and What We Changed

How the TOR Checker team handled feedback about the product, and what we changed because of it. Each entry says what was reported, why it happened, what we changed (with the pull requests), and how we checked it. The last section lists what we do not know.

- **Process:** this page is the log. The Sprint 6 retrospective decided to also track new feedback as issues with a `user-feedback` label (see [Sprint retrospectives](retrospectives.md)).
- **Team:** Karnpon, Pakorn, Paranyu

## Summary

| # | Date | Feedback | What we changed | Pull requests |
|---|---|---|---|---|
| 1 | 6 Oct 2026 | Some TOR data shown in our talk did not match the source on e-GP: statuses were behind and deadlines were wrong or blank | Read the procurement stage from the national e-GP first, add a way to capture new TORs from it, show the real deadline | [#143](https://github.com/SW-Process/TOR_website/pull/143), [#144](https://github.com/SW-Process/TOR_website/pull/144), [#145](https://github.com/SW-Process/TOR_website/pull/145), [#147](https://github.com/SW-Process/TOR_website/pull/147), [#153](https://github.com/SW-Process/TOR_website/pull/153), [#158](https://github.com/SW-Process/TOR_website/pull/158) |

## 1. TOR data did not match e-GP (6 October 2026)

Tracked in issue [#188](https://github.com/SW-Process/TOR_website/issues/188) (label `user-feedback`), opened on 10 November to record work done between 6 and 22 October.

### What was reported

In the talk on 6 October, some of the TOR data we showed did not match what e-GP shows for the same project. We opened our follow-up talk with this: "That was our mistake, and we are sorry." The slides "From last talk" and "Why we did wrong" are the source of this entry.

### Why it happened

We collected TORs only from the old e-GP site, the Bangkok Metropolitan Administration portal (`egp2.bangkok.go.th`). Our slides give three causes, and the pull request descriptions give the technical detail:

| Cause | Effect on our data | Source |
|---|---|---|
| Announcements on that site are not kept up to date | Our statuses fell behind the real ones. A project already awarded still showed as open ("เปิดรับ") | Talk slides, [#143](https://github.com/SW-Process/TOR_website/pull/143) |
| Some of its PDFs are missing dates (many invitation PDFs are blank drafts without the bid date) | Deadlines came through wrong or blank | Talk slides, [#143](https://github.com/SW-Process/TOR_website/pull/143) |
| New open TORs appear on the national e-GP before they appear on the BMA portal that our discovery reads | The product showed only a handful of open TORs | [#144](https://github.com/SW-Process/TOR_website/pull/144) |

The result, in the words of our slide, was "unstable data that did not match the current source".

### What we changed

We moved to the national e-GP (`process5.gprocurement.go.th`) as the main source and kept the BMA portal as a fallback. The design is in the [lifecycle source spec](../superpowers/specs/2026-10-06-gprocurement-lifecycle-source-design.md) and the [capture spec](../superpowers/specs/2026-10-07-gprocurement-capture-design.md).

| Date merged | Pull request | Change |
|---|---|---|
| 6 Oct | [#143](https://github.com/SW-Process/TOR_website/pull/143) | The lifecycle check asks the national e-GP first and falls back to the BMA portal per TOR. The bid deadline is read from the invitation PDF the national e-GP serves. A miss never clears a stored deadline. The run summary shows how many TORs each source answered. It can be switched off with `GPROC_ENABLED=false`. |
| 7 Oct | [#144](https://github.com/SW-Process/TOR_website/pull/144) | New open TORs can be captured from the national e-GP: an admin searches there, a Chrome extension collects the project numbers, and `POST /api/ingestion/capture` creates the missing TORs and queues them for AI. The search page has a human check, which we do not bypass, so capture is started by the admin. |
| 7 Oct | [#145](https://github.com/SW-Process/TOR_website/pull/145), [#147](https://github.com/SW-Process/TOR_website/pull/147) | Follow-ups found while testing capture. The calendar and dashboard now use the real bid deadline instead of the old field, and a month-only deadline is shown as a month. Day keys no longer shift by one day in Thailand. The admin page shows the last capture run and how many captured TORs are stuck. |
| 14 Oct | [#153](https://github.com/SW-Process/TOR_website/pull/153) | A draft TOR shows the end of the public hearing from the national e-GP instead of a deadline that does not apply yet. A TOR whose contract status already read "finished" is no longer skipped by the lifecycle refresh. |
| 22 Oct | [#158](https://github.com/SW-Process/TOR_website/pull/158) | An admin can run the lifecycle check for draft TORs only, so a draft's stage can be refreshed on demand. |

Later work in the same area: [#183](https://github.com/SW-Process/TOR_website/pull/183) (10 Nov) shows a link to the HTML announcement for projects that e-GP publishes without a PDF, which fixed the "TOR can't get pdf" bug ([#161](https://github.com/SW-Process/TOR_website/issues/161)).

### How we checked it

- The backend tests cover the new source mapping, the fallback to the BMA portal, deadline handling and capture. They use fake clients, so nothing reaches e-GP during the tests.
- Each pull request describes how to test it by hand on the admin ingestion page, with small limits because the run writes to the shared database, and what the run summary and system log should show.

## What we do not know

- **No before and after count.** We did not record how many TORs were wrong before the change, so we cannot show how much the mismatch fell. The run summary now reports how many TORs each source answered, and it is the nearest thing to a measure.
- **No record of who gave the feedback.** The slides and the retrospective do not say who noticed the mismatch, so this page does not say either. If it was an instructor, a classmate or a client, add it to the entry.
- **Only one entry.** Reports from the in-app "report incorrect data" button (an admin queue and a resolution note) are stored in the database, not in this repository, so none are listed here.
- **The national e-GP has no public contract.** Its endpoints are internal, so a change on their side can break the lifecycle check again. The fallback to the BMA portal is the protection.

## How to add feedback

1. Open an issue with the `user-feedback` label. Say who gave it, when, and what they saw.
2. Link the issue from a pull request with `Closes #xx`.
3. Add a row to the summary table and a section like the one above: what was reported, why it happened, what changed (with the pull requests), how it was checked.
