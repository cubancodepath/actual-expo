# CI/CD

Two workflows, nothing else:

| Workflow        | Runner                                              | Trigger                                    | What it does                                       |
| --------------- | --------------------------------------------------- | ------------------------------------------ | -------------------------------------------------- |
| `pr-check.yml`  | `ubuntu-latest` (GitHub-hosted, free — public repo) | push to `develop`, PRs to `develop`/`main` | tsc + vitest + lint + fmt + arch check, single job |
| `build-ios.yml` | **self-hosted (your Mac)**                          | push to `main`, manual dispatch            | `eas build --local` → uploads `.ipa` as artifact   |

Releasing to TestFlight stays manual: download the artifact (or build locally) and run `npm run submit:ios`.

## Self-hosted runner setup (your Mac)

### 1. Machine requirements

Most of this is already installed if you build locally (`npm run build:prod`):

| Tool        | Check             | Install                                                               |
| ----------- | ----------------- | --------------------------------------------------------------------- |
| Xcode + CLT | `xcode-select -p` | App Store / `xcode-select --install`                                  |
| Node 22     | `node -v`         | brew / nvm                                                            |
| pnpm        | `pnpm -v`         | `corepack enable` or `brew install pnpm`                              |
| Fastlane    | `fastlane -v`     | `brew install fastlane` (required by `eas build --local` for signing) |
| CocoaPods   | `pod --version`   | `brew install cocoapods`                                              |
| eas-cli     | —                 | used via `npx eas`, no global install needed                          |

### 2. Register the runner with GitHub

1. Go to the repo → **Settings → Actions → Runners → New self-hosted runner** → choose **macOS / arm64**.
2. Follow the shown commands (download, extract, then):

   ```bash
   ./config.sh --url https://github.com/cubancodepath/actual-expo --token <TOKEN-FROM-THAT-PAGE>
   ```

   Keep the default `macOS` label — `build-ios.yml` targets `[self-hosted, macOS]`.

3. Install it as a service so it survives reboots:

   ```bash
   ./svc.sh install
   ./svc.sh start
   ```

   This creates a LaunchAgent — it only runs while your user session is logged in. Also make sure the Mac doesn't sleep mid-build (Energy settings, or `caffeinate`).

4. Verify: the runner shows as **Idle** in Settings → Actions → Runners.

### 3. Secrets

| Secret              | Where to create                                                                            | Where to add                                      |
| ------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `EXPO_TOKEN`        | https://expo.dev/settings/access-tokens                                                    | repo → Settings → Secrets and variables → Actions |
| `SENTRY_AUTH_TOKEN` | https://sentry.io → Settings → Auth Tokens (org `cubancodepath`, scope `project:releases`) | repo → Settings → Secrets and variables → Actions |

`EXPO_TOKEN` lets `eas build --local` fetch the signing credentials from EAS without an interactive login.

`SENTRY_AUTH_TOKEN` is required by the production build to upload source maps to Sentry (`ios/sentry.properties` is gitignored and delegates to this env var) — without it the build fails at the upload step.

### 4. Security — read this

A self-hosted runner on a **public repo** executes whatever the triggering workflow tells it to, on your machine. Rules:

- `build-ios.yml` must **never** have a `pull_request` trigger. Only `push` to `main` and `workflow_dispatch`. A fork PR must not be able to reach your Mac.
- In repo → Settings → Actions → General, set fork PR approval to **"Require approval for all external contributors"**.
- All PR checks run on GitHub-hosted runners only (`pr-check.yml`), which is safe.

## Running a build

- Automatic: merge/push to `main`.
- Manual: `gh workflow run build-ios.yml` (or the "Run workflow" button in the Actions tab).
- The resulting `.ipa` appears as the `app-ipa` artifact on the run (kept 14 days).
