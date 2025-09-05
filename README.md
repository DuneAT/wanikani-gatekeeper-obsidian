# WaniKani Gatekeeper Plugin for Obsidian

**Are you tired of procratinating your Wanikani reviews ? Now you can't escape ! Whenever you open your Obsidian vault, that plugin will fetch the remaining reviews from Wanikani and ask you to complete them before accessing to your vault.** 

---

## Features

**WaniKani Gatekeeper** is an Obsidian plugin that ensures you complete your WaniKani reviews before accessing your notes. This plugin helps you stay consistent with your Japanese learning while using Obsidian.  

- Fetches your available WaniKani reviews via API.
- Displays a modal popup to complete reviews before using Obsidian.
- Color-coded headers for radicals, kanji, and vocabulary.
- Confetti celebration when all reviews are complete.
- Emergency exit option with `Ctrl + Alt + W` or `Esc`.
- Tracks incorrect answers and submits them back to WaniKani automatically to follow up with SRS system.
- Fully customizable in settings:
  - API token
  - Min reviews required
  - Header colors for radicals, kanji, and vocabulary
---

## Installation

1. Download or clone this repository into your Obsidian plugins folder:  <vault>/.obsidian/plugins/wanikani-gatekeeper
2. Enable the plugin in Obsidian under **Settings → Community Plugins**.

---

## Usage

1. Set your **WaniKani API token** in the plugin settings.
2. Configure the **min number of reviews** and **header colors** if desired.
3. When reviews are available, the gatekeeper popup will appear on opening Obsidian.
4. Complete at least the required number of reviews to close the popup.
5. If needed, trigger **emergency exit** with `Ctrl + Alt + W`, or `Esc`.

---

## Settings

| Setting | Description |
|---------|-------------|
| **API Token** | Your WaniKani API token. Required to fetch reviews. |
| **Min Reviews** | The minimum number of reviews required to close the modal. |
| **Radical Color** | Header color for radicals. |
| **Kanji Color** | Header color for kanji. |
| **Vocabulary Color** | Header color for vocabulary. |

---

## Contributing

Contributions are welcome!  

1. Fork the repository.  
2. Make your changes.  
3. Submit a pull request with a detailed description.  

---

## License

Obsidian license (0BSD).

---

## Notes

- Uses [WaniKani API v2](https://docs.wanikani.com/) to fetch reviews.
- Converts readings automatically to **hiragana** using [wanakana](https://github.com/WaniKani/WanaKana).  
- Confetti effect powered by [canvas-confetti](https://www.npmjs.com/package/canvas-confetti).  
