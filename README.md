# SolRadar

A plugin for Vencord.

Monitors channels for private Roblox server links and, if configured, joins them instantly.

> Built as a cleaner alternative to selfbot snipers. As a Vencord plugin, it runs natively inside Discord.

---

## Features

- **One-click access** to sniped private server links
- **Snipe history tab** to keep track of recent snipes
- **Extensive settings** to customize plugin behavior to your liking
- Possibly faster than most alternatives
- **No Discord token setup required** - as a Vencord plugin, it hooks natively into Discord's internals. No polling, no API spam; it simply listens to the `MESSAGE_CREATED` flux event directly.

---

## Installing

### Easy install (recommended)
Download the installer from [gitlab.com/masutty/solradar-installer](https://gitlab.com/masutty/solradar-installer) and run it. It should guide you on what you're missing and automate the Vencord installation steps.

### Manual install
If you know what you're doing, clone this repository inside your Vencord `userplugins` folder.

Otherwise, installing custom plugins requires Vencord to be installed from source. See:
- [Installing custom plugins on Vencord](https://docs.vencord.dev/installing/custom-plugins/)
- [Vencord from source](https://docs.vencord.dev/installing/)
- [Community guide on Vencord's Discord](https://discord.com/channels/1015060230222131221/1257038407503446176)

> **Note:** This plugin is unrelated to Vencord's development team. Please do not ask for support in Vencord's Discord server, they won't be able to help.

---

## Configuration

- By default, the plugin **does not verify** whether a sniped server belongs to Sol's RNG.
- To enable verification, configure a `ROBLOSECURITY` token in the plugin settings. **This is optional.** Snipes work without it, but the token makes them safer.

---

## Contributing

- Suggestions and feedback are welcome, send me a message on Discord.

This plugin was written pretty hastily and is far from perfect. If you're a Vencord plugin developer and feel like something could be done better, please reach out to me on Discord, I'd genuinely appreciate the help.

---

## Acknowledgements

- [Installing custom plugins on Vencord](https://docs.vencord.dev/installing/custom-plugins/)
- [Vencord source plugins](https://github.com/Vendicated/Vencord/tree/main/src/plugins)
- [maxstellar/maxstellar-Biome-Macro](https://github.com/maxstellar/maxstellar-Biome-Macro): biome icons
- [vexthecoder/OysterDetector](https://github.com/vexthecoder/OysterDetector): merchant icons
- [cresqnt-sys/MultiScope](https://github.com/cresqnt-sys/MultiScope/blob/94f1f06114a3e7cbff64e5fd0bf31ced99b0af79/LICENSE): biome detection logic (GPL-3.0, commit [94f1f06](https://github.com/cresqnt-sys/MultiScope/tree/94f1f06114a3e7cbff64e5fd0bf31ced99b0af79))

---

## License

Licensed under **AGPL-3.0-or-later**.

Individual source files carry the Vencord-required `SPDX-License-Identifier: GPL-3.0-or-later` header, but the plugin as a whole is distributed under AGPL-3.0-or-later due to adapted AGPL-licensed logic.

---

*Made with ❤️ + 🤖 for whoever finds it useful.*
