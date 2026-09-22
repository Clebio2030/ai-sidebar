// O Chrome só substitui __MSG_*__ no manifest e no CSS, nunca no HTML. Então a
// tradução das páginas é aplicada aqui, em cima de atributos data-i18n.
//
//   data-i18n="chave"        -> textContent
//   data-i18n-title="chave"  -> title
//   data-i18n-aria="chave"   -> aria-label
//
// Chaves ausentes no idioma do usuário caem no default_locale automaticamente,
// então basta manter en completo e traduzir o que fizer sentido.
const traduzir = (raiz = document) => {
    const pegar = (chave) => chrome.i18n.getMessage(chave)

    for (const el of raiz.querySelectorAll('[data-i18n]')) {
        const texto = pegar(el.dataset.i18n)
        if (texto) el.textContent = texto
    }
    for (const el of raiz.querySelectorAll('[data-i18n-title]')) {
        const texto = pegar(el.dataset.i18nTitle)
        if (texto) el.title = texto
    }
    for (const el of raiz.querySelectorAll('[data-i18n-aria]')) {
        const texto = pegar(el.dataset.i18nAria)
        if (texto) el.setAttribute('aria-label', texto)
    }

    const titulo = raiz === document && document.querySelector('title[data-i18n-page]')
    if (titulo) {
        const texto = pegar(titulo.dataset.i18nPage)
        if (texto) document.title = texto
    }
}
