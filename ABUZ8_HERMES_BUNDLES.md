# ABUZ8 Hermes Bundles

This fork is the public source and bundle catalog for ABUZ8's click-to-run Hermes
desktop and portable builds.

## Verified Windows bundles

| Label | Provider base | Bundle location | Runtime |
| --- | --- | --- | --- |
| Hermes Desktop | NousResearch Hermes Agent | `G:\Hermes\hermes-agent\apps\desktop` | Native Electron desktop with managed Hermes backend and onboarding |
| Hermes Portable | Hermes Agent v0.17.0 | `G:\ABUZ8-Agents\Hermes-Portable` | Embedded runtime, local brain, portable config and memory |
| Hermes Portable (E:) | ABUZ8 packaging copy | `E:\ABU\02_PACKAGING\portable-agents` | Self-extracting Windows package with embedded runtime |
| Hermes Desktop Source | ABUZ8 Hermes checkout | `C:\Users\wirec\GH_OPS\repos\hermes-agent` | Public fork checkout with desktop application, gateway, and test suite |

The paths above are the verified owner-machine locations used to build and test the
bundles. They are not required at runtime after a release package is assembled.

## Product contract

Each published Windows release is intended to be:

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

Hermes Agent remains available under its upstream MIT license. The ABUZ8 desktop
packaging, branding, and integration work are separate from the upstream project.
