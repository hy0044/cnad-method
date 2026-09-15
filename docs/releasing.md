# Releasing to npm

Publishing starts only when a GitHub Release is published in `hy0044/cnad-method`. The release tag must be an exact `vX.Y.Z` representation of the version in `package.json`; for example, package version `0.2.0` uses tag `v0.2.0`.

The workflow stages the package instead of publishing it directly:

```text
GitHub Release / vX.Y.Z
        ↓
GitHub Actions
        ↓
validation
        ↓
OIDC
        ↓
npm stage publish
        ↓
npm Staged Packages
        ↓
Human review
        ↓
2FA approval
        ↓
npm public registry
```

Before staging, `.github/workflows/publish.yml` installs the locked dependencies, runs the test, lint, and formatting checks, and validates the package with a dry run. It uses Node.js 24 and installs npm 11.15.0 explicitly, satisfying the minimum versions for npm staged publishing (Node.js 22.14.0 and npm 11.15.0).

The workflow has `id-token: write` permission, so npm Trusted Publishing authenticates `npm stage publish` with a short-lived GitHub Actions OIDC identity. No npm publishing token or other long-lived npm credential is stored in GitHub Secrets. The trusted publisher permits staging but not direct publication.

## npm configuration

The existing `cnad-method` package has a GitHub Actions trusted publisher configured on npmjs.com with:

- organization or user: `hy0044`
- repository: `cnad-method`
- workflow filename: `publish.yml`
- environment: none
- `npm stage publish`: allowed
- direct `npm publish`: disabled

Publishing access requires 2FA and disallows traditional publishing tokens. Keep these settings in place; do not add an npm write token to the repository or GitHub Actions secrets.

## Release procedure

1. Update `package.json` and `package-lock.json` to the same new `X.Y.Z` version and merge that change to `main` after CI passes.
2. Create and publish a GitHub Release from that commit with tag `vX.Y.Z`.
3. Confirm the **Publish to npm** workflow passes. A successful workflow means that the version is staged, not publicly available yet.
4. Sign in to [npmjs.com](https://www.npmjs.com), open **Staged Packages**, select the staged `cnad-method` version, and review its package details and contents.
5. Click **Approve** and complete the 2FA prompt. Only this human approval publishes the version to the public npm registry.
6. Confirm that npmjs.com lists the newly published version.

Maintainers can also inspect a staged version from an interactively authenticated npm CLI 11.15.0 or later:

```sh
npm stage list cnad-method
npm stage view <stage-id>
```

If CLI approval is necessary, `npm stage approve <stage-id>` prompts the maintainer for 2FA. Never add this command to GitHub Actions: the workflow's responsibility ends after creating the staged package.

Ordinary pull requests and pushes to `main` do not run the publishing workflow. If the tag format check, tag/package version match, or any quality gate fails, the staging step is not reached.
