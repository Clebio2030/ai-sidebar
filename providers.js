// Fonte única da lista de provedores. Usada pelo painel lateral e pela janela
// flutuante, para não haver duas listas divergindo com o tempo.
//
// Precisa ser idempotente: a janela flutuante reinjeta este arquivo a cada
// alternância, e um `const` no topo lançaria "already been declared" na
// segunda vez. `var` dentro do guarda é içado para o escopo do mundo isolado.
if (typeof AI_PROVIDERS === 'undefined') {
    var AI_PROVIDERS = [
        { id: 'chatgpt',  nome: 'ChatGPT',           url: 'https://chatgpt.com/' },
        { id: 'claude',   nome: 'Claude',            url: 'https://claude.ai/new' },
        { id: 'gemini',   nome: 'Gemini',            url: 'https://gemini.google.com/app' },
        { id: 'grok',     nome: 'Grok (X)',          url: 'https://grok.com/' },
        { id: 'copilot',  nome: 'Copilot',           url: 'https://copilot.microsoft.com/' },
        { id: 'meta',     nome: 'Meta AI',           url: 'https://www.meta.ai/' },
        { id: 'deepseek', nome: 'DeepSeek',          url: 'https://chat.deepseek.com/' },
        { id: 'lechat',   nome: 'Le Chat (Mistral)', url: 'https://chat.mistral.ai/chat' },
    ]

    var providerUrl = (id) =>
        (AI_PROVIDERS.find((p) => p.id === id) || AI_PROVIDERS[0]).url

    var providerExists = (id) => AI_PROVIDERS.some((p) => p.id === id)
}
