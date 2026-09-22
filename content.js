function findInput() {
    const selectors = [
        '#prompt-textarea',                                  // ChatGPT
        'div.ProseMirror[contenteditable="true"]',          // Claude
        '[contenteditable="true"][data-placeholder]',       // Gemini, Perplexity
        '[role="textbox"][contenteditable="true"]',         // Copilot, Meta AI
        'textarea[placeholder]',                            // DeepSeek, Grok, Le Chat
        '[contenteditable="true"]',
        'textarea',
    ]
    for (const sel of selectors) {
        const el = document.querySelector(sel)
        if (el && el.offsetParent !== null) return el
    }
    return null
}

function fillInput(el, text) {
    el.focus()
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
        const appended = el.value ? el.value + '\n' + text : text
        if (setter) setter.call(el, appended)
        else el.value = appended
        el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }))
    } else {
        // contenteditable (ProseMirror, Quill, etc.) — move cursor to end then insert
        const selection = window.getSelection()
        selection.selectAllChildren(el)
        selection.collapseToEnd()
        document.execCommand('insertText', false, el.textContent ? '\n' + text : text)
    }
}

function submitPrompt(el) {
    const looksLikeSend = (button) => {
        const label = (button.getAttribute('aria-label') || button.title || button.textContent || '').toLowerCase()
        return /send|enviar|submit/.test(label)
    }

    const attempt = (retries = 12) => {
        const button = Array.from(document.querySelectorAll('button:not([disabled])'))
            .find((b) => b.getAttribute('aria-disabled') !== 'true' && looksLikeSend(b))
        if (button) {
            button.click()
            return
        }
        if (retries > 0) {
            setTimeout(() => attempt(retries - 1), 250)
            return
        }
        // No send button matched - fall back to Enter, which every provider accepts.
        for (const type of ['keydown', 'keypress', 'keyup']) {
            el.dispatchEvent(new KeyboardEvent(type, {
                key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, composed: true,
            }))
        }
    }

    setTimeout(() => attempt(), 400)
}

window.addEventListener('message', (e) => {
    if (e.data?.type !== 'ai-sidebar-fill' || !e.data.text) return

    const attempt = (retries = 15) => {
        const el = findInput()
        if (el) {
            fillInput(el, e.data.text)
            if (e.data.submit) submitPrompt(el)
        } else if (retries > 0) {
            setTimeout(() => attempt(retries - 1), 300)
        }
    }
    attempt()
})

// Relata ao painel/janela qual conversa está aberta, para que trocar de aba
// continue de onde parou em vez de recomeçar. Os provedores trocam de URL por
// pushState, sem recarregar e sem disparar evento próprio — daí a checagem
// periódica, que é barata perto de qualquer alternativa.
if (window !== window.top) {
    let ultimaUrl = ''
    const relatarUrl = () => {
        if (location.href === ultimaUrl) return
        ultimaUrl = location.href
        try {
            window.parent.postMessage(
                { type: 'ai-sidebar-url', url: location.href, origem: location.origin },
                '*',
            )
        } catch (e) {
            /* pai de outra origem que não aceita a mensagem */
        }
    }

    relatarUrl()
    setInterval(relatarUrl, 1500)
    addEventListener('popstate', relatarUrl)
}
