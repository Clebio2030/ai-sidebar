# AI Sidebar

Extensão Chrome/Chromium que abre ChatGPT, Claude, Gemini, Grok, Copilot, Meta AI,
DeepSeek e Le Chat no painel lateral do navegador.

## Recursos

- Troca de provedor pelo seletor no topo do painel
- **Enviar para a barra lateral**: seleciona texto em qualquer página, botão direito,
  e o texto é colado no provedor ativo
- **Resumir página**: extrai o texto da aba ativa e pede um resumo ao provedor,
  com envio automático
- Microfone e área de transferência liberados dentro do painel

## Arquivos

| Arquivo | Papel |
|---|---|
| `manifest.json` | MV3; permissões `sidePanel`, `declarativeNetRequest`, `storage`, `contextMenus`, `scripting` |
| `background.js` | Regras de cabeçalho, extração da aba ativa, menu de contexto |
| `sidepanel.html` / `.js` | Painel: seletor, botão flutuante de resumo, modal de página protegida |
| `content.js` | Preenche o campo do provedor e envia; roda nos 8 domínios |
| `permission.html` / `.js` | Página que concede microfone ao painel |
| `icon.svg` | Fonte do ícone; os PNGs são renderizados a partir dele |

## Notas de implementação

### Microfone no painel lateral

Um painel lateral **não consegue exibir o aviso de permissão** do navegador, então
`getUserMedia()` falha com `NotAllowedError: Permission dismissed` — o pedido é
criado e descartado antes que alguém possa respondê-lo.

Com *permission delegation*, o pedido de um iframe é atribuído à origem de **topo**,
que aqui é `chrome-extension://<id>`, e não ao provedor. Por isso:

- conceder microfone a `gemini.google.com` **não resolve**
- `chrome.contentSettings` **recusa** padrões `chrome-extension://` (`Invalid scheme`)
- `audioCapture` no manifest não é reconhecido por todos os forks

A solução é `permission.html`: uma aba normal, onde o aviso **aparece**, pedindo
microfone para a origem da extensão. A concessão fica registrada e passa a valer
dentro do painel. O botão 🎤 só aparece enquanto a permissão não existe.

### Permissions Policy no iframe

O `allow` do iframe delega `microphone`, `clipboard-read/write` e outros; sem ele o
console acusa `Permissions policy violation`. Além disso, `background.js` remove os
cabeçalhos `Permissions-Policy` e `Feature-Policy` das respostas de sub-frame, porque
Gemini e Copilot enviam versões que desligam esses recursos.

### Aba ativa

`tabs.query({ active: true, windowType: 'normal' })` devolve uma aba por janela e
pegar a primeira é arbitrário. `findActiveTab()` tenta `currentWindow`, depois
`lastFocusedWindow`, e só então qualquer janela normal.

### Navegador Aside

O Aside não tem esquema próprio: as páginas internas dele também são `chrome://`
(`chrome://aside-adblock`, `chrome://aside-import-data`), então a lista de páginas
protegidas funciona sem caso especial.

Para depurar com CDP: Chromium 137+ desabilitou `--load-extension`, sendo preciso
`--enable-unsafe-extension-debugging` e o comando `Extensions.loadUnpacked`.

## Desenvolvimento

Carregue sem compactação em `chrome://extensions` com o Modo do desenvolvedor ligado.

Para regenerar os PNGs a partir do `icon.svg`, renderize-o em 16, 48 e 128 px.
