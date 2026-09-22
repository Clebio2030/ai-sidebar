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

// --- Diagnóstico temporário: remover quando microfone/clipboard estiverem ok ---
;(async () => {
    const fp = document.featurePolicy || document.permissionsPolicy
    const policy = (f) => {
        try { return fp ? fp.allowsFeature(f) : "sem API" } catch (e) { return "erro " + e.name }
    }
    const perm = async (name) => {
        try { return (await navigator.permissions.query({ name })).state } catch (e) { return "erro " + e.name }
    }
    let ancestors = []
    try { ancestors = Array.from(location.ancestorOrigins || []) } catch (e) { /* ignore */ }

    const report = {
        contexto: window !== window.top ? "IFRAME" : "ABA DE TOPO",
        origem: location.origin,
        ancestrais: ancestors.join(" <- ") || "(nenhum)",
        policyMic: policy("microphone"),
        policyClipboard: policy("clipboard-write"),
        permMic: await perm("microphone"),
        permClipboard: await perm("clipboard-write"),
    }

    // Sonda: so no frame filho direto do painel, para nao duplicar.
    if (ancestors.length === 1) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            stream.getTracks().forEach((t) => t.stop())
            report.getUserMedia = "OK"
        } catch (err) {
            report.getUserMedia = err.name + ": " + err.message
        }
    } else {
        report.getUserMedia = "(pulado: frame aninhado)"
    }

    console.log("[AI-Sidebar] " + JSON.stringify(report, null, 2))
    // Sobe para o contexto do painel para aparecer no console padrao do DevTools.
    if (window !== window.top) {
        try { window.parent.postMessage({ type: "ai-sidebar-diag", report }, "*") } catch (e) { /* ignore */ }
    }
})()
