# bb-plugin-usage-limit

Show live provider subscription usage directly below the chat input.

The plugin adds a single compact row under BB's composer with the current
session and weekly limits of the provider selected in that composer — Codex,
Claude Code, or Cursor — plus the signed-in account on the right.

Install it directly from this repository:

```sh
bb plugin install git:https://github.com/Willhong/bb-plugin-usage-limit.git@main
```

For development, install the checkout in place instead:

```sh
npm install --include=dev
npm run typecheck
npm run build
bb plugin install .
```

## Safety and scope

- Reads through BB's existing `bb.sdk.system.usageLimits` API. It never touches
  provider credentials and stores nothing in the browser.
- Usage is read from the thread's execution host, resolved through the thread's
  environment — not blindly from the primary machine.
- Read-only: the plugin registers no mutating routes or commands.

## Behaviour

- Only the aggregate windows are shown. Claude also returns one weekly window
  per model (labelled with the model's display name, e.g. `Fable`); those are
  filtered out so the row stays readable.
- Refreshes every 60 seconds, keeping the previous reading on screen while the
  poll is in flight. Hovering the row reveals a manual refresh button.
- Bars turn amber at 80% and red at 95%, with fallback colours so they remain
  visible in every BB theme.
- The reset hint shows the window that resets soonest.

## Implementation note

The public BB composer slot only renders *above* the input, so the UI is a
cleanup-safe content script that mounts its row directly after BB's composer
footer anchor. The mount reconciles against the live DOM on every frame: any
row that is no longer a footer's direct sibling is removed, which is what keeps
composer re-renders from stacking duplicate rows.
