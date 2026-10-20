# Dispatch

Your Claude chats on the iPhone home screen. Hold it sideways: the three most recent Claude threads (Co-work or Claude Code) and a **New chat** corner, in a 2×2 grid. Each card shows the first sentence of Claude's last reply.

- **Tap** a card to open the whole thread and reply.
- **Hold** a card to dictate. The card turns orange; let go, and it sends after 1.8 s unless you press **Edit** or **Cancel**.
- **New chat** starts a Co-work chat or a Claude Code session (pick the environment).
- Add `?demo` to the address to see it with made-up data.

Dispatch is only the phone side: plain HTML, CSS and JS, with no build step. The server is part of [Monodesk](https://github.com/TetonTopo/monodesk) (`bridge.js`), which uses Monodesk's Claude sign-in. **Monodesk must be running on your PC** for Dispatch to work.

## Set up

1. Install Monodesk and sign in to Claude in it.
2. Clone this repo next to Monodesk, for example in `Documents`:
   ```
   git clone https://github.com/TetonTopo/dispatch
   ```
   Monodesk serves `..\dispatch` on `http://127.0.0.1:47800`. To keep it somewhere else, set the `MONODESK_DISPATCH` environment variable to the folder and restart Monodesk.
3. Install [Tailscale](https://tailscale.com) on the PC and the iPhone, signed in to the same account.
4. On the PC, share the server on your tailnet (it keeps running after reboots):
   ```
   tailscale serve --bg 47800
   ```
   It prints an address like `https://<pc-name>.<tailnet>.ts.net`. Only your own Tailscale devices can open it; nothing is public.

## Add to the iPhone home screen

1. On the iPhone, turn Tailscale on.
2. Open the `https://<pc-name>.<tailnet>.ts.net` address in **Safari**.
3. Press **Share** (the square with the arrow), then **Add to Home Screen**, then **Add**.
4. Open **Dispatch** from the home screen. It opens full screen, sideways.

The first time you hold to dictate, iOS asks for the microphone; allow it.

## If something's off

- **"Can't reach Monodesk":** Monodesk isn't running on the PC, or Tailscale is off on one of them.
- **"Sign in to Claude in Monodesk":** open Co-work in Monodesk and sign in to Claude again.
- **Changes don't show up:** pull, then close Dispatch in the iPhone app switcher and reopen it.
