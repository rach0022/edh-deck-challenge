# Archived: Fly.io Deployment

These files previously deployed the EDH Deck Challenge to [Fly.io](https://fly.io).
They have been archived because the free trial ended and we no longer deploy there.

The project now focuses on **local Docker-based development** — see the root
`docker-compose.yml` and `README.md` for how to build and run the container locally.

## Files

- `fly.toml` — Fly.io app configuration.
- `fly-deploy.yml` — GitHub Actions workflow that automatically deployed to Fly on push
  to `main`/`master`. Moving it out of `.github/workflows/` disables it, so no further
  redeploys are triggered.

## Re-enabling (if ever needed)

1. Move `fly-deploy.yml` back to `.github/workflows/`.
2. Move `fly.toml` back to the repo root.
3. Re-add the `@flydotio/dockerfile` dev dependency and configure the `FLY_API_TOKEN` secret.
