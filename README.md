# Dispatch

Your Claude chats on the iPhone home screen. The three most recent Claude threads (Co-work or Claude Code) fill three quarters of a 2×2 grid that always reads landscape. Each card shows the first sentence of Claude's last reply. The fourth quarter is split into **New chat** and **All threads**.

- **Tap** a card to open the whole thread and reply. Full-screen pages follow the phone, so you can read them upright or sideways.
- **Hold** a card to dictate. The card turns orange; let go, and it sends after 1.8 s unless you press **Edit** or **Cancel**.
- **Speaker** (on a card, or at the top of a thread) reads Claude's latest reply aloud, skipping code; tap it again to stop. If the reply has a line with only `---` on it, it stops reading there (the rest is desk detail, still shown on screen). If Monodesk has an ElevenLabs key (`elevenLabsKey` in its `config.js`), it reads in an ElevenLabs voice: Monodesk makes the audio and the phone plays it, and a note shows what it cost in credits. Hearing the same reply again is free. Without a key, or if ElevenLabs fails, it uses the device's own voice. The sliders button next to it picks the voice from one list (ElevenLabs voices first, then the device's own), the ElevenLabs model (**Fast** = Flash v2.5, half a credit per character; **Best** = Multilingual v2 and **Expressive** = v3, one credit per character), speed and pause. All of this is kept on that device. ElevenLabs voices play a free sample when you tap them. If your ElevenLabs account has a voice collection named **dispatch** (My Voices → Collections), only its voices are listed. Otherwise you see all your voices plus Australian ones from the ElevenLabs library, which are added to your voices the first time one reads.
- **Player:** while a reply is read, a small bar at the bottom has **back 15 s**, **pause / play**, **forward 15 s**, the time, and stop. The same back, forward and pause work from the iPhone's lock screen and headphones. With the device's own voice there's only pause / play and stop (speech can't be skipped through).
- **New chat** starts a Co-work chat or a Claude Code session (pick the environment), always on Opus 5.5.
- **All threads** lists your recent chats and Code sessions, with search. Tap one to open it.
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
