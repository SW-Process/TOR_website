# File Handling

**ASVS 5.0 requirement documented here: 5.1.1 (L2):** for every upload feature, the permitted file types, extensions and maximum size (including unpacked size), how files are made safe for users to download, and what happens when a malicious file is detected.

The application takes files in from two places: avatar uploads by signed-in users, and TOR documents downloaded from the government e-GP systems. Users never upload documents.

## 1. File intake

| Feature | Who sends it | Allowed types | Size | Unpacked size | Where it is kept |
| --- | --- | --- | --- | --- | --- |
| Avatar (`POST /api/auth/avatar`) | Any signed-in user | JPEG, PNG, WebP, GIF, **decided by the file's bytes**, not its name or declared type (`utils/imageType.ts`, ASVS 5.2.2). The extension is ignored. | 5 MB (multer limit) | Not an archive | Cloud Storage key `avatars/<userId>` (one per user, replaced on upload) |
| TOR document (discovery) | e-GP (`egp2.bangkok.go.th`) | PDF (`%PDF` signature checked by `ingestion/pdfInspect.ts`) | 50 MB (`EGP_MAX_FILE_BYTES`, enforced while streaming) | Not an archive | Cloud Storage, key built from the project code |
| TOR document (capture, lifecycle) | National e-GP (`process5.gprocurement.go.th`) as a **zip bundle** | Zip in; only one PDF entry is taken out (a name with "TOR" as a word, else the invitation) | Bundle as downloaded | **At most 500 files and 200 MB declared unpacked size, checked from the central directory before anything is inflated; the chosen PDF at most 50 MB** (`ingestion/capture/torFromBundle.ts`, ASVS 5.2.3) | Cloud Storage |

Names supplied with a file are never used to build a storage path (5.3.2): keys are always built by us from ids.

## 2. Serving files back (ASVS 5.3.1, 5.4.1, 5.4.2)

| File | Response | Why it's safe |
| --- | --- | --- |
| Avatar `GET /api/auth/avatar/:userId` | `Content-Type` = the type detected at upload; `Content-Disposition: inline; filename="avatar"`; `Content-Security-Policy: default-src 'none'; img-src 'self'; sandbox`; `nosniff` | Even opened directly, it renders sandboxed as an image with no script. |
| TOR PDF `GET /api/tors/:id/document` | `Content-Type: application/pdf`; `Content-Disposition` built by `utils/contentDisposition.ts`; `frame-ancestors 'none'`; `nosniff` | Only for public (enriched) TORs. |

**File names (5.4.2).** The e-GP file name is shown to the user as the download name, but only through `contentDisposition()` (RFC 6266):
- `filename="…"` is an ASCII fallback, with every non-ASCII character and `" \ % ;` replaced by `_`;
- `filename*=UTF-8''…` carries the real (Thai) name, percent-encoded;
- line breaks, control characters and bidirectional-override characters are removed, and any path is cut off.

Files are never executed or served from a code directory: they live in Cloud Storage and are streamed through the API (5.3.1).

## 3. Malicious files (ASVS 5.4.3)

| Case | What happens |
| --- | --- |
| An "image" whose bytes aren't JPEG/PNG/WebP/GIF (HTML, SVG, scripts, polyglots) | Refused with `400`; nothing is stored; logged as `input.rejected`. |
| Oversized avatar | Refused with `400` by multer. |
| An e-GP download over 50 MB | The download is aborted mid-stream; the TOR is recorded as having no document. |
| A zip over the file-count or unpacked-size limit, or corrupt | Treated as "no TOR file"; nothing is unpacked. |
| A file that isn't a PDF | Tagged `unreadable` / `missing` by `pdfInspect`; not sent to the AI. |
| A PDF with malicious content inside | **Not detected yet: no antivirus scan.** The PDF comes from a government system, is served with `nosniff` and `frame-ancestors 'none'`, and opens in the browser's own PDF viewer. |

**Gap (5.4.3, L2):** files from e-GP are not scanned by an antivirus engine before users can download them. Plan: scan each PDF with ClamAV in the ingestion job before it is stored (or turn on Cloud Storage malware scanning), and keep a flagged file out of `GET /api/tors/:id/document`.
