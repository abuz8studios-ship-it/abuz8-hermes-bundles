# ABUZ8 Hermes Bundles

This fork is the public source and bundle catalog for ABUZ8's click-to-run Hermes
desktop and portable builds.

## Release status

**Windows acceptance prerelease published:** [Hermes
0.17.0](https://github.com/abuz8studios-ship-it/abuz8-hermes-bundles/releases/tag/v0.17.0-abuz8-win1).
It is a Windows x64 NSIS installer with no embedded model weights.

## Source-backed candidate

| Label | Provider base | Bundle location | Runtime |
| --- | --- | --- | --- |
| Hermes Desktop | NousResearch Hermes Agent | `C:\Users\wirec\GH_OPS\repos\hermes-agent\apps\desktop` | Native Electron desktop with managed backend, onboarding, model controls, and update paths |

The portable Hermes and self-extracting model payloads are deliberately excluded
from publication. They embed trial model runtimes and/or hand off to a terminal.

The path above is the owner-machine source used for staging. The published
prerelease was built from this source after a clean isolated install and native
window smoke test.

## Product contract

The GUI-complete source candidate is the Electron build at
`apps/desktop/release/win-unpacked`. The release artifact is the NSIS installer
linked above; it launches the native desktop UI and keeps user state outside
the installed resources directory.

The Hermes Portable launcher remains excluded because it calls `hermes.exe chat`
in a terminal after starting its local brain.

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

## Remaining acceptance scope

The prerelease has passed clean installation and native-window smoke testing.
Before calling it stable, the remaining acceptance pass must cover onboarding,
provider/model selection, memory persistence, tools, skills, voice/vision
settings, GPU allocation, and upstream update controls.

Hermes Agent remains available under its upstream MIT license. The ABUZ8 desktop
packaging, branding, and integration work are separate from the upstream project.
