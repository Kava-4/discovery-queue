# Discovery Queue Auto

A [Millennium](https://steambrew.app/) plugin that automatically completes your Steam discovery queue and claims sale rewards — trading cards and free event stickers.

---

## Features

- Auto-generates and skips through your daily discovery queue
- Claims free event stickers when available
- Steam toast notifications when queue cards or stickers can be collected
- Optional auto-run on the Discovery Queue page
- Optional auto-skip while browsing queue item pages
- Lightweight (~13 KB installed)

## Prerequisites

- [Millennium](https://steambrew.app/) installed on Steam (Windows or Linux)

## Install from source

```powershell
git clone https://github.com/Kava-4/discovery-queue.git
cd discovery-queue
npm install
npm run package
```

Copy `release/discovery_queue` to your Steam plugins folder:

- **Windows:** `C:\Program Files (x86)\Steam\plugins\discovery_queue`
- **Linux:** `~/.local/share/Steam/plugins/discovery_queue`

Enable **Discovery Queue Auto** in Steam → Millennium → Plugins.

## Usage

1. Open the **Store** tab inside the Steam client
2. Go to **Discovery Queue** (`store.steampowered.com/explore`)
3. Click **Auto Discover Queue**, or enable **Auto-run** in plugin settings

During Steam sales, set **Queue runs per session** to `3` to collect up to 3 trading cards per day.

## Settings

| Setting | Description |
| --- | --- |
| Queue runs | How many times to complete the queue per run (default: 3) |
| Notify when rewards are available | Steam toast when cards or stickers are ready |
| Auto-run on Discovery Queue page | Start automatically on `/explore` |
| Auto-skip while browsing queue | Advance automatically on queue item pages |
| Claim free stickers | Claim daily event stickers after queue completion |

## Development

```powershell
npm install
npm run dev    # watch mode — symlink folder to Steam/plugins/
npm run build  # production build
npm run package # build + create release/discovery_queue/
```

## Disclaimer

Unofficial plugin — not affiliated with Valve or Steam Client Homebrew. Automating Steam store actions may violate the [Steam Subscriber Agreement](https://store.steampowered.com/subscriber_agreement/). Use at your own risk.
