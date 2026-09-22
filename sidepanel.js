
const providerSelect = document.getElementById('provider')
const frame = document.getElementById('ai-frame')

// As opções vêm de providers.js, para não haver duas listas divergindo.
for (const p of AI_PROVIDERS) {
    const opcao = document.createElement('option')
    opcao.value = p.id
    opcao.textContent = p.nome
    providerSelect.appendChild(opcao)
}

const setProvider = async (id) => {
    const safe = providerExists(id) ? id : AI_PROVIDERS[0].id
    frame.src = providerUrl(safe)
    providerSelect.value = safe
    await chrome.storage.local.set({ selectedProvider: safe })
}

providerSelect.addEventListener('change', e => setProvider(e.target.value))

chrome.storage.local.get('selectedProvider').then(({ selectedProvider = 'chatgpt' }) => {
    setProvider(selectedProvider)
})

// When the iframe finishes loading, deliver any pending text
frame.addEventListener('load', async () => {
    if (!frame.src || frame.src === 'about:blank') return
    const { pendingText } = await chrome.storage.local.get('pendingText')
    if (pendingText) {
        frame.contentWindow.postMessage({ type: 'ai-sidebar-fill', text: pendingText }, '*')
        chrome.storage.local.remove('pendingText')
    }
})

// When the user right-clicks while the sidebar is already open and the AI is loaded
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.pendingText?.newValue) return
    if (!frame.src || frame.src === 'about:blank') return
    frame.contentWindow.postMessage({ type: 'ai-sidebar-fill', text: changes.pendingText.newValue }, '*')
    chrome.storage.local.remove('pendingText')
})
const summarize = document.getElementById('summarize')
const blocked = document.getElementById('blocked')
const blockedDetail = document.getElementById('blocked-detail')
const blockedAction = document.getElementById('blocked-action')

const PROMPT_TEMPLATES = {
    pt: 'Resuma o conteúdo desta página em português.\n\nTítulo: {TITLE}\nURL: {URL}\n\nConteúdo:\n{CONTENT}',
    en: 'Please summarize the content of this webpage in English.\n\nTitle: {TITLE}\nURL: {URL}\n\nContent:\n{CONTENT}',
}

const buildSummaryPrompt = ({ title, url, content }) => {
    const ui = (chrome.i18n.getUILanguage() || '').toLowerCase()
    const template = PROMPT_TEMPLATES[ui.startsWith('pt') ? 'pt' : 'en']
    return template
        .replace('{TITLE}', title || '')
        .replace('{URL}', url || '')
        .replace('{CONTENT}', content || '')
}

const askBackground = (message, timeoutMs = 8000) =>
    new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ error: 'timeout' }), timeoutMs)
        try {
            chrome.runtime.sendMessage(message, (response) => {
                clearTimeout(timer)
                resolve(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : response)
            })
        } catch (error) {
            clearTimeout(timer)
            resolve({ error: error.message })
        }
    })

const showBlocked = (action, detail) => {
    blockedAction.textContent = action
    blockedDetail.textContent = detail || ''
    blocked.showModal()
}

document.getElementById('blocked-ok').addEventListener('click', () => blocked.close())

summarize.addEventListener('click', async () => {
    const label = summarize.querySelector('.btn-text')
    summarize.disabled = true
    label.textContent = 'Lendo…'
    try {
        const page = await askBackground({ action: 'GET_ACTIVE_TAB_CONTENT' })
        if (!page?.content) {
            if (page?.error === 'protected') {
                showBlocked('Abra um site comum numa aba, deixe-a como aba ativa e clique em Resumir de novo.', page.url)
            } else if (page?.error === 'empty') {
                showBlocked('A página não devolveu texto legível. Espere ela carregar e tente de novo.', page.url)
            } else if (page?.error === 'timeout') {
                showBlocked('A página demorou demais para responder. Tente de novo.', page.url)
            } else {
                showBlocked('Não foi possível extrair o conteúdo.', page?.error)
            }
            return
        }
        frame.contentWindow.postMessage(
            { type: 'ai-sidebar-fill', text: buildSummaryPrompt(page), submit: true },
            '*',
        )
    } finally {
        summarize.disabled = false
        label.textContent = 'Resumir página'
    }
})

// The panel cannot show a permission bubble, so the mic request is dismissed
// before the user can answer. A normal tab can show it, and the grant is stored
// for this extension origin - which is what a delegated iframe request resolves
// to - so it then applies inside the panel.
// Troca para a janela flutuante: o service worker injeta na aba ativa e
// passa a tratar o clique no ícone como "flutuar" em vez de "abrir painel".
document.getElementById('flutuar').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'USAR_FLUTUANTE' })
    window.close()
})

const micFix = document.getElementById("mic-fix")

micFix.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("permission.html") })
})

const trackMicPermission = async () => {
    try {
        const status = await navigator.permissions.query({ name: "microphone" })
        const sync = () => { micFix.hidden = status.state === "granted" }
        status.addEventListener("change", sync)
        sync()
    } catch (error) {
        micFix.hidden = false
    }
}

trackMicPermission()

// --- Diagnóstico temporário: remover junto com o bloco em content.js ---
window.addEventListener('message', (e) => {
    if (e.data?.type !== 'ai-sidebar-diag') return
    const r = e.data.report
    const lines = [
        'contexto    : ' + r.contexto,
        'origem      : ' + r.origem,
        'ancestrais  : ' + r.ancestrais,
        'policy mic  : ' + r.policyMic,
        'policy clip : ' + r.policyClipboard,
        'perm mic    : ' + r.permMic,
        'perm clip   : ' + r.permClipboard,
        'getUserMedia: ' + r.getUserMedia,
    ]
    console.log(lines.map((l) => '[AI-Sidebar] ' + l).join('\n'))
})
