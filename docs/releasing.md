# Releasing to npm

Publishing is performed by `.github/workflows/publish.yml` only when a GitHub Release is published in `hy0044/cnad-method`. The release tag must be an exact `vX.Y.Z` representation of the version in `package.json`; for example, package version `0.1.0` uses tag `v0.1.0`.

Before publishing, the workflow installs the locked dependencies, runs the test, lint, and formatting checks, and validates the package with a dry run. It then publishes the public package with npm Trusted Publishing and GitHub Actions OIDC. No npm token is stored in GitHub Secrets.

## One-time npm setup

An npm package owner must complete the following outside this repository:

1. Create an npm account, enable two-factor authentication, and verify the account email address.
2. Claim `cnad-method` with its first public publication. npm cannot configure a trusted publisher for a package before that package exists, so publish `cnad-method@0.1.0` once from the `v0.1.0` source using npm's interactive authentication and `npm publish --access public`. Do not create the `v0.1.0` GitHub Release afterward, because npm versions are immutable and the workflow cannot republish it.
3. On npmjs.com, open the package's **Settings** page and add a GitHub Actions trusted publisher with:
   - organization or user: `hy0044`
   - repository: `cnad-method`
   - workflow filename: `publish.yml`
   - environment: leave blank
4. Ensure the npm account retains ownership of the package. No npm credential or access token should be added to the repository or its GitHub Actions secrets.

## Release procedure

1. Update `package.json` and `package-lock.json` to the same new `X.Y.Z` version and merge that change to `main` after CI passes.
2. Create and publish a GitHub Release from that commit with tag `vX.Y.Z`.
3. Confirm the **Publish to npm** workflow passes and that npm lists the new package version.

Ordinary pull requests and pushes to `main` do not run the publishing workflow. If the tag format, tag/package version match, or any quality gate fails, the publish step is not reached.
