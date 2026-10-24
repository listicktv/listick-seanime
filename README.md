# listick-seanime

A [Seanime](https://seanime.app) plugin for [Listick](https://github.com/listicktv/listick), anime only:

- **Tracking:** episodes Seanime counts go to your Listick history; what's playing shows as watching now, and one you stop partway goes to Continue watching.
- **Home:** Seanime-style poster rows on Home: Up next, Plan to watch, and any lists or rows you turn on in the tray's **Home rows**.
- **Tray:** your anime Up next and Plan to watch; your lists, followed lists, Watched and Rated; and Discover (For you and
  Listick's anime rows), each title with Open.

AniList updates are unchanged.

## Requirements

- Seanime 3.10 or newer
- A Listick account (listick.tv or your own) and its Seanime key: in Listick, **Settings › Connections › Seanime**

## Install

1. In Seanime: **Extensions › Add extension**, with this manifest URL:
   `https://raw.githubusercontent.com/listicktv/listick-seanime/main/manifest.json`
2. Allow its permissions (playback events, AniList data for the cards, network access to your Listick).
3. In the plugin's settings, set **Listick address** (for example `https://listick.tv`) and **API key**.

Anime are matched by AniList id via [Fribb's anime-lists](https://github.com/Fribb/anime-lists); unmapped ones are skipped.

## More

[Releases](https://github.com/listicktv/listick-seanime/releases) · [Security](SECURITY.md) · [Listick API](https://github.com/listicktv/listick/blob/main/docs/api.md)

## Support

- ⭐ Star this repository
- 🐞 Report bugs or suggest features in [issues](https://github.com/listicktv/listick-seanime/issues)
- 🤝 Pull requests are welcome (`npm test`; no dependencies)
- ☕ Donate on [Ko-fi](https://ko-fi.com/listicktv)

## Disclaimer

listick-seanime sends what you watch in Seanime to your Listick and shows your Listick lists in Seanime. It does not host,
stream or link to any video. Not affiliated with Seanime or AniList.

Licence: [AGPL-3.0](LICENSE).
