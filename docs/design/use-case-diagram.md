# Use Case Model

The TOR Checker use case diagram, drawn from the actual codebase (backend routes, frontend pages, the Chrome extension, and the Cloud Run jobs).

How these parts are deployed and connected is shown in the [system design](system-design.md).

![TOR Checker use case diagram](use-case-diagram.png)

[`use-case-diagram.svg`](use-case-diagram.svg) is the vector version and stays sharp at any zoom level.

See also the [domain model](domain-model.md): the concepts behind these use cases and how they relate.

The order of calls inside the main use cases is shown in the [sequence diagrams](sequence-diagram.md).

## Notation

| Symbol | Meaning |
|---|---|
| Solid line | Association: the actor uses the use case |
| Solid line with hollow triangle | Generalization: the actor inherits another actor's use cases |
| Dashed arrow «include» | The use case at the arrowhead always runs as part of the base use case |
| Dashed arrow «extend» | The use case at the tail optionally adds behavior to the base use case under a condition |

The code that implements these use cases is shown in the [class diagram](class-diagram.md).

## Actors

| Actor | Type | Role |
|---|---|---|
| Guest | Primary | Public visitor; can search and read TORs without signing in |
| Registered User | Abstract | Parent of every account holder; inherits everything a Guest can do |
| Vendor | Primary | Software company that tracks TORs and prepares bids |
| Admin | Primary | Maintains data and the system; must pass 2FA on every sign-in |
| Google OAuth | Secondary | Verifies identity for Sign in with Google |
| Email Service | Secondary | SendGrid; sends password-reset emails and TOR digest emails |
| e-GP System | Secondary | Thailand's government e-procurement system; the source of TOR data |
| Gemini AI | Secondary | Model on Vertex AI that reads and summarizes TOR documents |
| Cloud Scheduler | Secondary · timer | Triggers discovery, AI enrichment, and lifecycle refresh on a schedule |

## Use cases

### Browse & Discover TORs

| ID | Use case | Actor | Relationship | Description |
|---|---|---|---|---|
| UC-01 | Search TORs | Guest | — | Search TOR announcements by keyword |
| UC-02 | Filter by Agency, Budget & Deadline | — | «extend» UC-01 | Narrow results by agency, category, budget, and submission deadline, only when the user wants to |
| UC-03 | Compare Price Statistics | Guest | — | View budget and reference-price statistics by category |
| UC-04 | Browse Help Center | Guest | — | Read FAQs and announcements from the admin team |
| UC-05 | View TOR Details | Guest | — | Open the detail page of a single TOR |
| UC-06 | Read AI Summary | — | UC-05 «include» | Gemini-written summary of the TOR, shown every time the details are opened |
| UC-07 | View Fairness Signals | — | UC-05 «include» | Neutral review prompts, e.g. a brand name in the spec or an unusually short submission window; never accusations |
| UC-08 | Download TOR PDF | — | «extend» UC-05 | Download the original TOR document stored in Cloud Storage |
| UC-09 | Report Incorrect Data | — | «extend» UC-05 | Flag wrong TOR data for an admin to review (handled in UC-28) |

### Account & Security

| ID | Use case | Actor | Relationship | Description |
|---|---|---|---|---|
| UC-10 | Log In | Guest | — | Sign in with email and password |
| UC-11 | Log In with Google | Google OAuth | «extend» UC-10 | Sign in with a Google account instead of a password |
| UC-12 | Verify 2FA Code | — | «extend» UC-10 | Enter an authenticator-app code when 2FA is on; required for every admin sign-in |
| UC-13 | Sign Up | Guest | — | Register as a vendor |
| UC-14 | Reset Forgotten Password | Guest, Email Service | — | Request a password reset; the system emails a reset link |
| UC-15 | Manage Account & Security | Registered User | — | Change email or password, set up 2FA, view and revoke sessions, delete the account; the sensitive changes (not just viewing) require a recent re-authentication |

### Vendor Workspace

| ID | Use case | Actor | Relationship | Description |
|---|---|---|---|---|
| UC-16 | Manage Company Profile | Vendor | — | Enter company details, expertise, and technologies used for TOR matching |
| UC-17 | View Matched TORs | Vendor | — | See TORs that match the company profile |
| UC-18 | Hide Irrelevant TOR | — | «extend» UC-17 | Hide a TOR that is not relevant from the list |
| UC-19 | Bookmark TOR | Vendor | — | Save a TOR to follow |
| UC-20 | Track Application Status | — | «extend» UC-19 | Set the status: interested / preparing / submitted / missed |
| UC-21 | Save Search Criteria | Vendor | — | Save a search; the system notifies the vendor when a new TOR matches it |
| UC-22 | View Deadline Calendar | Vendor | — | See submission deadlines of followed TORs on a calendar |
| UC-23 | Add Day Notes | — | «extend» UC-22 | Write a note on a calendar day |
| UC-24 | Receive Match & Deadline Alerts | Vendor | — | Receive notifications about matching TORs: a profile match or a saved-search match. A deadline reminder is planned (the type exists) but nothing sends it yet |
| UC-25 | Chat with Admin | Vendor | — | Send questions to the admin team |

### Administration

| ID | Use case | Actor | Relationship | Description |
|---|---|---|---|---|
| UC-26 | Review TOR Records | Admin | — | Check the quality of ingested TOR data |
| UC-27 | Edit / Remove TOR | — | «extend» UC-26 | Correct a TOR or remove a wrong one from the system |
| UC-28 | Handle Error Reports | Admin | — | Review and resolve incorrect-data reports from users |
| UC-29 | Reply to User Chats | Admin | — | Answer vendor messages |
| UC-30 | Manage Help Content | Admin | — | Create, edit, and delete FAQs and announcements |
| UC-31 | Monitor Logs & User Sessions | Admin | — | View system logs (including the edits admins make to TORs); revoke a user's sessions. The audit trail of every admin change is also written to the application log in Cloud Logging, not shown in the admin panel |
| UC-32 | Run Ingestion Manually | Admin | UC-34 «include» | Start an ingestion run without waiting for the schedule |
| UC-33 | Capture Projects via Browser Extension | Admin, e-GP System | — | Collect project numbers from the e-GP search page with the Chrome extension and send them to the system, up to 100 per send |

### Automated Data Pipeline

| ID | Use case | Actor | Relationship | Description |
|---|---|---|---|---|
| UC-34 | Discover New TORs | Cloud Scheduler, e-GP System | — | Fetch new announcements, keep only Bangkok agencies and software procurement, and store the PDFs |
| UC-35 | Enrich TOR with AI | Cloud Scheduler, Gemini AI | — | Have Gemini read the PDF, write a summary, assign a category, and detect fairness signals |
| UC-36 | Match & Notify Vendors | Email Service | UC-35 «include» | Match new TORs against vendor profiles and saved searches, then send notifications and digest emails |
| UC-37 | Refresh Procurement Lifecycle | Cloud Scheduler, e-GP System | — | Update the procurement stage and deadlines of TORs that are still open |

How the data behind these use cases is stored is shown in the [ER diagram](er-diagram.md).

## Traceability to requirements and issues

Each use case, the functional requirements in the [SRS](../SRS.md) it covers, and the issues on the [project board](https://github.com/orgs/SW-Process/projects/4) that built it. Each issue in turn links to the design documents it follows, in its *Design reference* section. Use cases marked "no FR" were added during the project and have no requirement in the SRS yet, so the pull request is listed instead.

| Use case | Requirements | Issues |
|---|---|---|
| UC-01 Search TORs | FR-1, FR-2, FR-10 | [#78](https://github.com/SW-Process/TOR_website/issues/78), [#79](https://github.com/SW-Process/TOR_website/issues/79), [#80](https://github.com/SW-Process/TOR_website/issues/80), [#90](https://github.com/SW-Process/TOR_website/issues/90) |
| UC-02 Filter by Agency, Budget & Deadline | FR-3 – FR-7 | [#81](https://github.com/SW-Process/TOR_website/issues/81) – [#87](https://github.com/SW-Process/TOR_website/issues/87) |
| UC-03 Compare Price Statistics | FR-18 | [#97](https://github.com/SW-Process/TOR_website/issues/97) |
| UC-04 Browse Help Center | no FR | — |
| UC-05 View TOR Details | FR-8, FR-10, FR-11 | [#88](https://github.com/SW-Process/TOR_website/issues/88), [#90](https://github.com/SW-Process/TOR_website/issues/90), [#91](https://github.com/SW-Process/TOR_website/issues/91), [#92](https://github.com/SW-Process/TOR_website/issues/92) |
| UC-06 Read AI Summary | FR-12 – FR-14, FR-20 | [#21](https://github.com/SW-Process/TOR_website/issues/21), [#22](https://github.com/SW-Process/TOR_website/issues/22), [#113](https://github.com/SW-Process/TOR_website/issues/113), [#114](https://github.com/SW-Process/TOR_website/issues/114) |
| UC-07 View Fairness Signals | FR-15 – FR-17, FR-20 | [#43](https://github.com/SW-Process/TOR_website/issues/43), [#93](https://github.com/SW-Process/TOR_website/issues/93) – [#96](https://github.com/SW-Process/TOR_website/issues/96), [#114](https://github.com/SW-Process/TOR_website/issues/114) |
| UC-08 Download TOR PDF | FR-9, FR-13 | [#89](https://github.com/SW-Process/TOR_website/issues/89), [#161](https://github.com/SW-Process/TOR_website/issues/161) |
| UC-09 Report Incorrect Data | FR-41 | [#45](https://github.com/SW-Process/TOR_website/issues/45), [#46](https://github.com/SW-Process/TOR_website/issues/46) |
| UC-10 Log In | FR-21 | [#17](https://github.com/SW-Process/TOR_website/issues/17), [#18](https://github.com/SW-Process/TOR_website/issues/18) |
| UC-11 Log In with Google | FR-21 | [#17](https://github.com/SW-Process/TOR_website/issues/17), [#18](https://github.com/SW-Process/TOR_website/issues/18) |
| UC-12 Verify 2FA Code | no FR | PR [#160](https://github.com/SW-Process/TOR_website/pull/160) |
| UC-13 Sign Up | FR-21, FR-23 | [#17](https://github.com/SW-Process/TOR_website/issues/17), [#18](https://github.com/SW-Process/TOR_website/issues/18), [#20](https://github.com/SW-Process/TOR_website/issues/20) |
| UC-14 Reset Forgotten Password | no FR | PR [#149](https://github.com/SW-Process/TOR_website/pull/149) |
| UC-15 Manage Account & Security | no FR | PR [#160](https://github.com/SW-Process/TOR_website/pull/160) |
| UC-16 Manage Company Profile | FR-22, FR-23 | [#19](https://github.com/SW-Process/TOR_website/issues/19), [#20](https://github.com/SW-Process/TOR_website/issues/20), [#66](https://github.com/SW-Process/TOR_website/issues/66) |
| UC-17 View Matched TORs | FR-24 – FR-26 | [#42](https://github.com/SW-Process/TOR_website/issues/42), [#44](https://github.com/SW-Process/TOR_website/issues/44), [#67](https://github.com/SW-Process/TOR_website/issues/67) |
| UC-18 Hide Irrelevant TOR | no FR | — |
| UC-19 Bookmark TOR | FR-27 | [#52](https://github.com/SW-Process/TOR_website/issues/52), [#53](https://github.com/SW-Process/TOR_website/issues/53) |
| UC-20 Track Application Status | FR-31, FR-32 | [#54](https://github.com/SW-Process/TOR_website/issues/54), [#55](https://github.com/SW-Process/TOR_website/issues/55) |
| UC-21 Save Search Criteria | FR-28 | [#106](https://github.com/SW-Process/TOR_website/issues/106), [#107](https://github.com/SW-Process/TOR_website/issues/107), [#108](https://github.com/SW-Process/TOR_website/issues/108) |
| UC-22 View Deadline Calendar | FR-33 | [#56](https://github.com/SW-Process/TOR_website/issues/56) |
| UC-23 Add Day Notes | no FR | — |
| UC-24 Receive Match & Deadline Alerts | FR-29, FR-30 | [#100](https://github.com/SW-Process/TOR_website/issues/100) – [#105](https://github.com/SW-Process/TOR_website/issues/105) |
| UC-25 Chat with Admin | no FR | PR [#126](https://github.com/SW-Process/TOR_website/pull/126) |
| UC-26 Review TOR Records | FR-19, FR-40 | [#111](https://github.com/SW-Process/TOR_website/issues/111), [#112](https://github.com/SW-Process/TOR_website/issues/112), [#117](https://github.com/SW-Process/TOR_website/issues/117), [#118](https://github.com/SW-Process/TOR_website/issues/118) |
| UC-27 Edit / Remove TOR | FR-40 | [#117](https://github.com/SW-Process/TOR_website/issues/117), [#120](https://github.com/SW-Process/TOR_website/issues/120) |
| UC-28 Handle Error Reports | FR-40, FR-41 | [#118](https://github.com/SW-Process/TOR_website/issues/118), [#119](https://github.com/SW-Process/TOR_website/issues/119), [#120](https://github.com/SW-Process/TOR_website/issues/120) |
| UC-29 Reply to User Chats | no FR | PR [#126](https://github.com/SW-Process/TOR_website/pull/126) |
| UC-30 Manage Help Content | no FR | — |
| UC-31 Monitor Logs & User Sessions | FR-34, FR-37 – FR-39 | [#57](https://github.com/SW-Process/TOR_website/issues/57), [#58](https://github.com/SW-Process/TOR_website/issues/58), [#98](https://github.com/SW-Process/TOR_website/issues/98), [#99](https://github.com/SW-Process/TOR_website/issues/99), [#109](https://github.com/SW-Process/TOR_website/issues/109), [#110](https://github.com/SW-Process/TOR_website/issues/110), [#162](https://github.com/SW-Process/TOR_website/issues/162) |
| UC-32 Run Ingestion Manually | FR-35, FR-36 | [#49](https://github.com/SW-Process/TOR_website/issues/49), [#50](https://github.com/SW-Process/TOR_website/issues/50) |
| UC-33 Capture Projects via Browser Extension | FR-42 | [#188](https://github.com/SW-Process/TOR_website/issues/188) (PR [#144](https://github.com/SW-Process/TOR_website/pull/144)) |
| UC-34 Discover New TORs | FR-42, FR-43 | [#11](https://github.com/SW-Process/TOR_website/issues/11) |
| UC-35 Enrich TOR with AI | FR-12, FR-15, FR-18, FR-20 | [#13](https://github.com/SW-Process/TOR_website/issues/13), [#21](https://github.com/SW-Process/TOR_website/issues/21), [#93](https://github.com/SW-Process/TOR_website/issues/93) – [#97](https://github.com/SW-Process/TOR_website/issues/97), [#113](https://github.com/SW-Process/TOR_website/issues/113), [#115](https://github.com/SW-Process/TOR_website/issues/115) |
| UC-36 Match & Notify Vendors | FR-24, FR-29, FR-30 | [#42](https://github.com/SW-Process/TOR_website/issues/42), [#100](https://github.com/SW-Process/TOR_website/issues/100), [#101](https://github.com/SW-Process/TOR_website/issues/101), [#104](https://github.com/SW-Process/TOR_website/issues/104), [#105](https://github.com/SW-Process/TOR_website/issues/105) |
| UC-37 Refresh Procurement Lifecycle | FR-8, FR-42 | [#152](https://github.com/SW-Process/TOR_website/issues/152), [#188](https://github.com/SW-Process/TOR_website/issues/188) |

All 43 requirements appear in at least one row. The "no FR" rows are a gap in the SRS, not in the code: these features exist, but the SRS has not been updated to name them.

## Modeling notes

- **Login is a precondition** for every Vendor and Admin use case, so the diagram does not draw an «include» to Log In from each one.
- **Registered User is an abstract actor.** Vendor and Admin inherit from Registered User, which inherits from Guest.
- **Cloud Scheduler is a timer actor** that triggers the `tor-discovery`, `tor-enrichment`, and `tor-lifecycle` jobs. An admin can also start an ingestion run through UC-32.
- The admin statistics dashboard and the Terms and Privacy Policy pages only display information, so they are not counted as use cases.

The backend endpoints behind these use cases are listed in the [API reference](api.md).
