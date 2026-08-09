# Korea100 Threads API

Korea100 keeps Meta Threads credentials in `web/.env.local`, which is ignored by git.

Required environment variables:

- `THREADS_APP_ID`
- `THREADS_APP_SECRET`
- `THREADS_ACCESS_TOKEN`
- `THREADS_USER_ID` is optional; the scripts resolve `me` from the access token when it is omitted.

Official Meta permissions:

- `threads_basic` is required for Threads API calls.
- `threads_content_publish` is required for publishing endpoints.

Read-only connection check:

```bash
cd web
npm run threads:check
```

Text post dry-run:

```bash
cd web
npm run threads:publish-text -- --text="Korea100 test"
```

Real publish requires an explicit confirmation flag:

```bash
cd web
npm run threads:publish-text -- --text="Korea100 text" --confirm
```

Publishing is a two-step Threads API flow: create a media container with `POST /{threads-user-id}/threads`, then publish it with `POST /{threads-user-id}/threads_publish`.
