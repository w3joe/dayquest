# Automatic production deployments

Production: **https://dayquest-pi.vercel.app**. The existing `dayquest` project belongs to `tanweejoe-7327s-projects` on Vercel.

## Deploy on every push to main

Vercel's GitHub integration builds and deploys commits pushed or merged to `main`. A successful production build updates the live address. Other branches are disabled in `vercel.json`; no local deployment command or GitHub Actions deployment secret is needed for this flow.

The project needs the following connection in place:

1. Install the [Vercel GitHub app](https://github.com/apps/vercel) for `w3joe/dayquest`. Access can be limited to this repository.
2. In the [project's Git settings](https://vercel.com/tanweejoe-7327s-projects/dayquest/settings/git), connect `w3joe/dayquest` and enable Git deployments.
3. Keep `main` as the Production branch in the project's Production environment settings.

The equivalent repository connection command, after installing the app, is:

```bash
vercel git connect https://github.com/w3joe/dayquest.git --yes --scope tanweejoe-7327s-projects
```

The checked-in `git.deploymentEnabled` rules explicitly enable `main` and disable other branch names, including names containing slashes. Vercel treats an explicit `true` match as enabled even when the catch-all rule is `false`.

After a push, open the [project deployments](https://vercel.com/tanweejoe-7327s-projects/dayquest) and confirm that the deployment has source GitHub, branch `main`, the expected commit, and a Ready status. A failed build does not replace the previous successful production deployment.

## Run checks manually

Open [DayQuest checks (manual)](https://github.com/w3joe/dayquest/actions/workflows/manual-ci.yml), click **Run workflow**, select **main**, then run it. CI installs locked dependencies, typechecks, runs the existing tests and verifies the production build on Node 26, matching the Vercel project. No image generation or OpenAI credits are used.

This workflow remains manual and does not deploy or gate Vercel's Git deployments. It needs no GitHub secrets or Vercel token.

## Optional manual deployment

From this repository on a computer signed in to Vercel:

```bash
npm run deploy:vercel
```

Install the CLI with `npm install --global vercel@65.5.0` if needed, then `vercel login` if this computer is not already signed in. A separate access token is not required for local CLI deployment.

The command fetches `origin/main`, checks out that committed version in a temporary worktree, installs dependencies, typechecks and runs the existing tests. It then asks Vercel to build and deploy that version to production using your existing CLI login. Your current branch and unfinished edits stay in place. The temporary worktree is removed when the command finishes. Build or check failures stop the command.

The temporary checkout excludes `.env.local`, uploaded photos, `.data/`, and unfinished local code. Production environment values are supplied by Vercel during its remote build and at runtime.

## Production environment and rollback

Keep `OPENAI_API_KEY`, `BLOB_READ_WRITE_TOKEN` and `BLOB_BASE_URL` in the project's **Production** environment. Optional model settings are in `.env.example`. No credentials are committed to the repository.

Changing Vercel environment values takes effect on the next deployment. To roll back, promote a previously successful deployment in Vercel's dashboard, or revert the change on `main` and push it to trigger a new build.

References: [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration), [connecting Git repositories with the CLI](https://vercel.com/docs/cli/git), [manually running GitHub workflows](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
