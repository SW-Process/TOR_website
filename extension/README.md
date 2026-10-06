# TOR Aggregator – e-GP capture (Chrome extension, Manifest V3)

Lets an admin collect project numbers from the national e-GP search page
(`process5.gprocurement.go.th`) and send them to the TOR Aggregator backend
(`POST /api/ingestion/capture`). Plain JS, no build step, no dependencies.

## Safety rules

- It only **observes** the responses of the page's own search request. It never issues the process5 search itself and never touches the Turnstile token.
- It sends **nothing** until the admin presses the **ส่งเข้าระบบ** button (max 100 projects per send).
- It never reads cookies. Requests to the configured API base use `credentials: "include"`, so the browser attaches the admin session itself.

## Load it

1. Open `chrome://extensions` and enable **Developer mode**.
2. **Load unpacked** and pick this `extension/` folder.

## Flow

1. Search on process5 yourself and page through the results; the badge count grows.
2. Open the extension popup and press **ส่งเข้าระบบ**.
3. The popup polls the run while it is open and shows the summary (reopening it resumes the last run); sent projects are removed from the collection. **ล้าง** empties it.

The API URL defaults to `http://localhost:8000`. To point at the deployed API, enter its URL in the popup and press **บันทึก** (Chrome asks for permission to that origin). Only the origin of the URL is saved, so an API served under a path prefix is not supported.

## Tests

`cd extension && npm test` (or `node --test test/*.test.js`) runs the parser tests only. The rest is verified by hand:

## Manual verification checklist

- [ ] 1. The badge count grows when paging through search results.
- [ ] 2. Logged in as admin in the web app, Send returns a summary and the TORs appear in the admin runs list as phase `capture`.
- [ ] 3. Cookie check: if Send answers "ต้องล็อกอินเป็นแอดมินในเว็บก่อน" although you are logged in, Chrome did not send the `SameSite=Lax` session cookie from the extension. Report it (fallback: an admin-generated token, not built yet).
- [ ] 4. Not logged in: Send shows the same "ต้องล็อกอินเป็นแอดมินในเว็บก่อน" message.
- [ ] 5. Close the popup mid-run and reopen it: the status resumes and the final summary appears. A second Send while a run is active shows "มีการส่งข้อมูลที่กำลังประมวลผลอยู่ รอให้เสร็จก่อน".
- [ ] 6. `localhost:8000` is the default; saving a deployed API URL works and the permission prompt appears.
