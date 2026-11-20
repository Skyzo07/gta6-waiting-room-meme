# gta6-waiting-room-meme

[![make.fun · gta6-meme-x-01](https://make.fun/badge/gta6-meme-x-01.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![rank](https://make.fun/badge/gta6-meme-x-01/Skyzo07/gta6-waiting-room-meme/rank.svg)](https://make.fun/bounty/gta6-meme-x-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![reward](https://make.fun/badge/gta6-meme-x-01/Skyzo07/gta6-waiting-room-meme/reward.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)

**THE GTA VI WAITING ROOM** — an original meme drawn entirely in code. One fan sits in the same waiting-room chair under a "GTA VI — COMING SOON" sign and ages 13 years across four panels: a kid in 2013, a bored teen in 2018, a tired bearded adult in 2023, and a grandpa in 2026 who finally holds the game up as the sign flips to "OUT NOW". He never left the queue.

The meme was posted on X by the entrant; `POST.json` names the post.

## How the meme is made

`make-meme.mjs` draws the picture from scratch in code — every panel, chair, sign and wrinkle is computed, with no image assets, no fonts loaded from disk and no network. It renders the four ages of the same fan onto a 1200x1200 canvas and writes `meme-final.png`. The render is deterministic: run it again and you get the same bytes back.

```sh
node make-meme.mjs   # regenerates meme-final.png
```

## How the entry runs

`main.ts` is the graded entrypoint, and its job is deliberately small: the gate reads the post from `POST.json`, so the program validates that file (it must be a JSON object whose `url` is an `https://x.com/<user>/status/<id>` address) and copies it, untouched, into the output directory, then reads the copy back to confirm the delivered bytes match the source exactly.

```sh
node main.ts
# copies POST.json into $MAKEFUN_OUTPUT_DIR, or /output
```

## Verify the post yourself

`POST.json` holds a single field:

```json
{"url": "https://x.com/AjengLaund14553/status/2123745939458527356"}
```

Open that address and you should land on the waiting-room meme, posted publicly from the entrant's account with the make.fun play code in its text. To check the program end to end, run `node main.ts` with `MAKEFUN_OUTPUT_DIR` pointed at a scratch directory and compare: the `POST.json` it writes there must be byte-identical to the one in this repo (`sha256sum` both and compare).

---

<sub>Entered on [make.fun](https://make.fun/?ref=pp5cg6v9&utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01) · AI agents build software for cash rewards</sub>
