# GCP Deployment — TOR ingestion

Deploys the backend as one Cloud Run **service** (`tor-api`, the read/admin API) plus
two Cloud Run **jobs** (`tor-discovery`, `tor-enrichment`) driven by Cloud Scheduler.
Placeholders: `<PROJECT>`, `<REGION>` (`asia-southeast1`), `<BUCKET>`, `<IMG>`,
`<MONGODB_URI>`, `<FRONTEND_URL>`.

## One-time

- Enable APIs:

  ```sh
  gcloud services enable run.googleapis.com cloudscheduler.googleapis.com \
    aiplatform.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com
  ```

- Artifact Registry repo for the image:

  ```sh
  gcloud artifacts repositories create tor --repository-format=docker --location=asia-southeast1
  ```

- Bucket for TOR PDFs:

  ```sh
  gcloud storage buckets create gs://<BUCKET> --location=asia-southeast1 --uniform-bucket-level-access
  ```

- MongoDB URI as the only secret:

  ```sh
  printf '%s' "<MONGODB_URI>" | gcloud secrets create MONGODB_URI --data-file=-
  ```

- Service accounts and IAM:

  ```sh
  gcloud iam service-accounts create tor-jobs-sa
  gcloud iam service-accounts create tor-api-sa

  # tor-jobs-sa: Vertex AI + write PDFs + read the secret
  gcloud projects add-iam-policy-binding <PROJECT> \
    --member=serviceAccount:tor-jobs-sa@<PROJECT>.iam.gserviceaccount.com --role=roles/aiplatform.user
  gcloud storage buckets add-iam-policy-binding gs://<BUCKET> \
    --member=serviceAccount:tor-jobs-sa@<PROJECT>.iam.gserviceaccount.com --role=roles/storage.objectAdmin
  gcloud secrets add-iam-policy-binding MONGODB_URI \
    --member=serviceAccount:tor-jobs-sa@<PROJECT>.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor

  # tor-api-sa: read PDFs + read the secret
  gcloud storage buckets add-iam-policy-binding gs://<BUCKET> \
    --member=serviceAccount:tor-api-sa@<PROJECT>.iam.gserviceaccount.com --role=roles/storage.objectViewer
  gcloud secrets add-iam-policy-binding MONGODB_URI \
    --member=serviceAccount:tor-api-sa@<PROJECT>.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor
  ```

## Image

The backend needs a `Dockerfile` that runs `npm ci && npm run build` and leaves
`dist/` in the image; the `CMD` is overridden per Cloud Run resource via `--command`
/ `--args`.

```sh
gcloud builds submit backend --tag <REGION>-docker.pkg.dev/<PROJECT>/tor/backend:latest
```

Use that tag as `<IMG>` below.

## API service

```sh
gcloud run deploy tor-api \
  --image <IMG> --region asia-southeast1 \
  --service-account tor-api-sa@<PROJECT>.iam.gserviceaccount.com \
  --min-instances 0 \
  --set-secrets MONGODB_URI=MONGODB_URI:latest \
  --set-env-vars STORAGE_DRIVER=gcs,GCS_BUCKET=<BUCKET>,CLIENT_ORIGIN=<FRONTEND_URL> \
  --command node --args dist/server.js \
  --allow-unauthenticated
```

## Jobs

```sh
gcloud run jobs deploy tor-discovery \
  --image <IMG> --region asia-southeast1 --service-account tor-jobs-sa@<PROJECT>.iam.gserviceaccount.com \
  --set-secrets MONGODB_URI=MONGODB_URI:latest \
  --set-env-vars "^::^STORAGE_DRIVER=gcs::GCS_BUCKET=<BUCKET>::INGEST_AGENCIES=สำนักดิจิทัลกรุงเทพมหานคร,สำนักการแพทย์,สำนักอนามัย,สำนักสิ่งแวดล้อม,สำนักการจราจรและขนส่ง::INGEST_LOOKBACK_DAYS=7::INGEST_DEFAULT_MAX_PROJECTS=200" \
  --command node --args dist/jobs/discovery.js --max-retries 0 --task-timeout 1800s --memory 512Mi

gcloud run jobs deploy tor-enrichment \
  --image <IMG> --region asia-southeast1 --service-account tor-jobs-sa@<PROJECT>.iam.gserviceaccount.com \
  --set-secrets MONGODB_URI=MONGODB_URI:latest \
  --set-env-vars "^::^STORAGE_DRIVER=gcs::GCS_BUCKET=<BUCKET>::GOOGLE_CLOUD_PROJECT=<PROJECT>::GOOGLE_CLOUD_LOCATION=us-central1::VERTEX_MODEL=gemini-2.5-flash::MAX_AI_CALLS_PER_RUN=50" \
  --command node --args dist/jobs/enrichment.js --max-retries 0 --task-timeout 1800s --memory 1Gi
```

> Both commands use gcloud's alternate-delimiter form `--set-env-vars "^::^k=v::k=v..."`
> because `INGEST_AGENCIES` is itself a comma-separated list: with the default separator
> gcloud would read each agency name after the first as its own `key=value` pair and
> reject the command. `::` is the separator here (no value contains it); the
> `tor-enrichment` command uses the same form for consistency even though none of its
> values contain a comma.

## Schedules (cadence lives here — change with `gcloud scheduler jobs update`, no redeploy)

```sh
gcloud scheduler jobs create http tor-discovery-cron --location asia-southeast1 \
  --schedule "0 * * * *" \
  --uri "https://<REGION>-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/<PROJECT>/jobs/tor-discovery:run" \
  --http-method POST \
  --oauth-service-account-email tor-jobs-sa@<PROJECT>.iam.gserviceaccount.com

gcloud scheduler jobs create http tor-enrichment-cron --location asia-southeast1 \
  --schedule "*/15 * * * *" \
  --uri "https://<REGION>-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/<PROJECT>/jobs/tor-enrichment:run" \
  --http-method POST \
  --oauth-service-account-email tor-jobs-sa@<PROJECT>.iam.gserviceaccount.com
```

## MongoDB Atlas M0

Network access `0.0.0.0/0` (Cloud Run has no static egress without a paid VPC
connector). Use a strong SRV credential; it is the only secret.

## Backfill

Run discovery ad-hoc with a wider window (overrides only for this execution):

```sh
gcloud run jobs execute tor-discovery \
  --update-env-vars INGEST_LOOKBACK_DAYS=180,INGEST_DEFAULT_MAX_PROJECTS=500
```
