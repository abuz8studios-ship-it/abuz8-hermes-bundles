# ABUZ8 Hermes Bundles

This fork is the public source and bundle catalog for ABUZ8's click-to-run Hermes
desktop and portable builds.

## Release status

**No binary release is published yet.** The repository is intentionally source
and catalog only until a clean staged payload passes the one-click acceptance
gate in `docs/ABUZ8_BUILD_AND_RELEASE.md`.

## Source-backed candidate (not released)

| Label | Provider base | Bundle location | Runtime |
| --- | --- | --- | --- |
| Hermes Desktop | NousResearch Hermes Agent | `C:\Users\wirec\GH_OPS\repos\hermes-agent\apps\desktop` | Native Electron desktop with managed backend, onboarding, model controls, and update paths |

The portable Hermes and self-extracting model payloads are deliberately excluded
from publication. They embed trial model runtimes and/or hand off to a terminal.

The path above is the owner-machine source used for staging. It is not a
downloadable release until a clean profile is generated and the acceptance gate
passes.

## Product contract

The GUI-complete source candidate is the Electron build at
`G:\Hermes\win-unpacked\Hermes.exe`. It is not released yet: it needs a clean
staged profile and a clean-machine first-run smoke test.

The Hermes Portable launcher is excluded because it calls `hermes.exe chat` in a
terminal after starting its local brain.

Each finished Windows release is intended to be:

- launched by double-clicking one installer or portable executable;
- self-contained, with its own runtime, backend, frontend, and isolated state;
- onboarded in the desktop UI without terminal commands;
- safe to copy to another Windows x64 machine without copying the owner's profile.

## What is not committed

Executable payloads, model weights, live Hermes state, OAuth credentials, Telegram
tokens, `.env` files, and local databases are intentionally excluded from Git.
They belong in versioned GitHub Release assets or a separate private delivery
channel. Never commit `%LOCALAPPDATA%\hermes`, `state.db`, token files, or user
configuration.

## Current gaps

The Hermes Desktop candidate needs a clean-profile rebuild and a clean-machine
test covering onboarding, provider/model selection, memory persistence, tools,
skills, voice/vision settings, GPU allocation, and upstream update controls.

Hermes Agent remains available under its upstream MIT license. The ABUZ8 desktop
packaging, branding, and integration work are separate from the upstream project.
