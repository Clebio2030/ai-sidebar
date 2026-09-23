# Privacy Policy — AI Sidebar

_Last updated: 22 September 2026_

## Summary

AI Sidebar has no servers. It does not collect, store, sell or transmit your personal
data to anyone. Everything happens between your browser and the AI provider you
choose, using the session you already have with that provider.

## What the extension does with data

### Page content

When you click **Summarize page**, the extension reads the text of the tab you are
looking at, strips scripts, styles and navigation, and writes it into the prompt box
of the AI provider you selected. It is sent to that provider — ChatGPT, Claude,
Gemini, Grok, Copilot, Meta AI, DeepSeek or Le Chat — exactly as if you had pasted
it yourself.

The same happens when you select text on a page and use **Send to AI Sidebar** from
the context menu.

The extension never sends this text anywhere else. There is no analytics, no
telemetry and no backend belonging to this extension.

### What is stored, and where

The extension keeps a small amount of state in your browser's local extension
storage. It never leaves your device:

| Stored | Why |
|---|---|
| Selected provider | Reopen on the provider you were using |
| Floating window position, size and pinned state | Keep the window where you put it |
| Last conversation URL per provider | Continue the same conversation across tabs |
| Text pending delivery from the context menu | Hand it to the provider once the panel opens |

You can erase all of it by removing the extension.

### Your accounts with the AI providers

The extension embeds the providers' own web apps. Your login, your conversation
history and your subscription belong to those providers and are governed by their
privacy policies, not by this one. The extension has no access to your credentials
and cannot read what is inside those embedded pages, apart from the current address
of the conversation, which it stores locally so it can reopen it.

## Permissions

| Permission | Why it is needed |
|---|---|
| `sidePanel` | Show the providers in the browser side panel |
| `scripting` | Read the text of the active tab for **Summarize page**, and inject the floating window when you ask for it |
| `storage` | Keep the preferences listed above, locally |
| `contextMenus` | Add **Send to AI Sidebar** to the right-click menu |
| `declarativeNetRequest` | Adjust response headers so the providers can be displayed in a frame and so the microphone and clipboard work inside the panel |
| Host access | The providers can be opened over any page, and **Summarize page** must be able to read the tab you are on |

The extension does not use remote code. All JavaScript it runs ships inside the
package.

## Contact

Questions or requests: open an issue at
<https://github.com/Clebio2030/ai-sidebar/issues>.

## Trademarks

Not affiliated with OpenAI, Google, Anthropic, xAI, Microsoft, Meta, DeepSeek or
Mistral. All trademarks belong to their respective owners.
