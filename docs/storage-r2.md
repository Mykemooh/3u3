# Setting up Cloudflare R2 for job photos and videos

Why R2: 10 GB of storage free every month, and no charge when clients view
their photos. Vercel Blob's free allowance is about 1 GB. Until R2 is set
up, the app keeps working on Vercel Blob: photos upload fine (the phone
shrinks them to ~300 KB first), but videos are refused with a clear message
because Vercel won't accept uploads over ~4.5 MB.

Budget check: a typical job is ~8 rooms × before/after photos at ~300 KB,
about 5 MB. That's roughly 2,000 jobs of photos in the free 10 GB. A 30-second
phone video is 15–60 MB, so videos are what fill storage — which is what
`VIDEO_RETENTION_DAYS` is for.

## 1. Create the bucket (5 minutes)

1. Sign up / sign in at dash.cloudflare.com → **R2 Object Storage**.
   (R2 asks for a card to activate even on the free tier; you're only
   charged past 10 GB.)
2. **Create bucket** → name it `3u3-job-media` → location Automatic → Create.
3. Open the bucket → **Settings** → **Public access** → under
   *R2.dev subdomain* click **Allow Access**. Copy the URL it shows
   (`https://pub-xxxxxxxx.r2.dev`). That's `R2_PUBLIC_URL`.
   *(Later, once 3u3cleaning.com is on Cloudflare, add it as a Custom
   Domain here instead — r2.dev is rate-limited and meant for light use.)*
4. Same Settings page → **CORS policy** → Add CORS policy → paste, swapping
   in your real site address(es):

   ```json
   [
     {
       "AllowedOrigins": ["https://3u3-fm98.vercel.app", "https://www.3u3cleaning.com"],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedHeaders": ["Content-Type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

## 2. Create an access key

1. R2 overview page → **Manage R2 API Tokens** → **Create API token**.
2. Permissions: **Object Read & Write**. Scope: **Apply to specific
   buckets only** → `3u3-job-media`. Create.
3. Copy the **Access Key ID** and **Secret Access Key** (the secret is only
   shown once). Your **Account ID** is on the R2 overview page.

## 3. Add to Vercel

Project → Settings → Environment Variables (Production), then redeploy:

| Name | Value |
|---|---|
| `R2_ACCOUNT_ID` | Account ID from the R2 overview page |
| `R2_ACCESS_KEY_ID` | from step 2 |
| `R2_SECRET_ACCESS_KEY` | from step 2 |
| `R2_BUCKET` | `3u3-job-media` |
| `R2_PUBLIC_URL` | `https://pub-xxxxxxxx.r2.dev` from step 1 |
| `VIDEO_RETENTION_DAYS` | e.g. `60` (optional — photos are never deleted) |
| `CRON_SECRET` | any long random string (needed for the video clean-up) |

## 4. Check it

`npm run verify:storage` confirms the upload-signing code matches AWS's
reference example. Then on the live site, start a test job as a cleaner and
add a video: it should upload with a progress bar and appear in the room.
If it fails straight away, it's almost always the CORS origin in step 1.4
not exactly matching the site address.
