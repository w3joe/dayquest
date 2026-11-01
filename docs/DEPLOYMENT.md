# Manual checks and Vercel deployment

Assigned production address: **https://dayquest-pi.vercel.app**. This belongs to the existing `dayquest` project in `tanweejoe-7327s-projects`; it becomes live after the first successful production deployment.

## Run CI manually

Open [DayQuest checks (manual)](https://github.com/w3joe/dayquest/actions/workflows/manual-ci.yml), click **Run workflow**, select **main**, then run it. CI installs locked dependencies, typechecks, runs the existing tests and verifies the production build on Node 26, matching the Vercel project. No image generation or OpenAI credits are used.

There are no push, pull-request or scheduled triggers. CI does not deploy. It needs no GitHub secrets or Vercel token.

## Deploy manually using your existing login

From this repository on a computer signed in to Vercel:

```bash
npm run deploy:vercel
```

Install the CLI with `npm install --global vercel@65.5.0` if needed, then `vercel login` if this computer is not already signed in. A separate access token is not required for local CLI deployment.

The command fetches `origin/main`, checks out that committed version in a temporary worktree, installs dependencies, typechecks and runs the existing tests. It then asks Vercel to build and deploy that version to production using your existing CLI login. Your current branch and unfinished edits stay in place. The temporary worktree is removed when the command finishes. Vercel prints the deployment URL and production address; build/check failures stop the command.

The temporary checkout intentionally excludes `.env.local`, uploaded photos, `.data/`, and unfinished local code. Production environment values are supplied by Vercel during its remote build and at runtime.

## No automatic deployments

`vercel.json` disables Vercel Git deployments for every branch. The Vercel project is also currently disconnected from Git and has Git deployment creation disabled. Pushing or merging code does not deploy it. Only an explicit deployment command or dashboard action publishes a build.

GitHub-hosted runners do not share this computer's Vercel login. Deploying from GitHub Actions would require an authentication secret; this setup keeps CI in GitHub and deployment on your signed-in computer.

## Production environment

Keep `OPENAI_API_KEY`, `BLOB_READ_WRITE_TOKEN` and `BLOB_BASE_URL` in the project's **Production** environment. The existing local OpenAI key has been added as a sensitive Vercel variable; Blob credentials and the image-model setting were already configured. Optional model settings are in `.env.example`. No credentials are committed to the repository.

Changing Vercel environment values takes effect on the next manual deployment. To roll back, promote a previously successful deployment in Vercel's dashboard, or revert the change on `main` and run the deployment command again.

References: [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration), [Vercel CLI login](https://vercel.com/docs/cli/login), [manually running GitHub workflows](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
