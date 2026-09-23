traduzir()

const providerSelect = document.getElementById('provider')
const frame = document.getElementById('ai-frame')
const popupScreen = document.getElementById('popup-screen')
const popupProviderName = document.getElementById('popup-provider-name')
const popupOpenBtn = document.getElementById('popup-open-btn')

// As opções vêm de providers.js, para não haver duas listas divergindo.
for (const p of AI_PROVIDERS) {
    const opcao = document.createElement('option')
    opcao.value = p.id
    opcao.textContent = p.nome
    providerSelect.appendChild(opcao)
}

// Última conversa aberta em cada provedor, compartilhada com a janela
// flutuante: é o que faz alternar entre painel e janela — ou trocar de aba —
// continuar de onde parou, em vez de recomecar do zero.
let conversas = {}
let provedorAtual = 'chatgpt'

const setProvider = async (id) => {
    const safe = providerExists(id) ? id : AI_PROVIDERS[0].id
    provedorAtual = safe
    await chrome.storage.local.set({ selectedProvider: safe })
    providerSelect.value = safe

    if (providerIsPopupOnly(safe)) {
        // Provedor não funciona em iframe (cookies de terceiros bloqueados).
        // Mostra tela intermediária e gerencia janela popup.
        frame.src = 'about:blank'
        frame.hidden = true
        const nomeProv = AI_PROVIDERS.find(p => p.id === safe)?.nome || safe
        popupProviderName.textContent = nomeProv
        const btnSpan = document.getElementById('popup-provider-name-btn')
        if (btnSpan) btnSpan.textContent = nomeProv
        popupScreen.hidden = false
        // Avisa o service worker para sincronizar a janela popup aberta (se houver)
        chrome.runtime.sendMessage({ action: 'POPUP_PROVIDER_CHANGED', id: safe, url: providerUrl(safe) })
    } else {
        popupScreen.hidden = true
        frame.hidden = false
        frame.src = conversas[safe] || providerUrl(safe)
    }
}

providerSelect.addEventListener('change', e => setProvider(e.target.value))

// O content.js dentro do iframe relata qual conversa está aberta.
window.addEventListener('message', (e) => {
    if (e.data?.type !== 'ai-sidebar-url' || !e.data.url) return
    if (e.source !== frame.contentWindow) return
    // Ignora redirecionamentos para fora do provedor, como telas de login.
    if (e.data.origem !== providerOrigin(provedorAtual)) return
    if (conversas[provedorAtual] === e.data.url) return
    conversas[provedorAtual] = e.data.url
    chrome.storage.local.set({ conversas }).catch(() => {})
})

chrome.storage.local.get(['selectedProvider', 'conversas']).then(
    ({ selectedProvider = 'chatgpt', conversas: salvas }) => {
        conversas = salvas || {}
        setProvider(selectedProvider)
    },
)

// Botão de abrir janela popup do provedor
popupOpenBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'OPEN_PROVIDER_POPUP', id: provedorAtual, url: providerUrl(provedorAtual) })
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

const buildSummaryPrompt = ({ title, url, content }) =>
    chrome.i18n.getMessage('summaryPrompt', [title || '', url || '', content || ''])

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

const blockedTitle = document.getElementById('blocked-title')

const showBlocked = (action, detail, titulo) => {
    blockedTitle.textContent = titulo || chrome.i18n.getMessage('blockedTitle')
    blockedAction.textContent = action
    blockedDetail.textContent = detail || ''
    blocked.showModal()
}

document.getElementById('blocked-ok').addEventListener('click', () => blocked.close())

summarize.addEventListener('click', async () => {
    const label = summarize.querySelector('.btn-text')
    summarize.disabled = true
    label.textContent = chrome.i18n.getMessage('summarizeLoading')
    try {
        const page = await askBackground({ action: 'GET_ACTIVE_TAB_CONTENT' })
        if (!page?.content) {
            if (page?.error === 'protected') {
                showBlocked(chrome.i18n.getMessage('blockedProtected'), page.url)
            } else if (page?.error === 'empty') {
                showBlocked(chrome.i18n.getMessage('blockedEmpty'), page.url)
            } else if (page?.error === 'timeout') {
                showBlocked(chrome.i18n.getMessage('blockedTimeout'), page.url)
            } else {
                showBlocked(chrome.i18n.getMessage('blockedUnknown'), page?.error)
            }
            return
        }
        frame.contentWindow.postMessage(
            { type: 'ai-sidebar-fill', text: buildSummaryPrompt(page), submit: true },
            '*',
        )
    } finally {
        summarize.disabled = false
        label.textContent = chrome.i18n.getMessage('summarizeButton')
    }
})

// Troca para a janela flutuante: o service worker injeta na aba ativa e
// passa a tratar o clique no ícone como "flutuar" em vez de "abrir painel".
document.getElementById('flutuar').addEventListener('click', async () => {
    // Só fecha o painel se a janela realmente abriu: fechar antes de saber
    // deixava o usuário sem painel e sem janela em páginas restritas.
    const r = await chrome.runtime.sendMessage({ action: 'USAR_FLUTUANTE' })
    if (r?.ok) {
        window.close()
        return
    }
    showBlocked(
        r?.motivo === 'restrita'
            ? chrome.i18n.getMessage('floatRestricted')
            : chrome.i18n.getMessage('floatFailed', [r?.motivo || chrome.i18n.getMessage('reasonUnknown')]),
        r?.url,
        chrome.i18n.getMessage('floatUnavailable'),
    )
})

// O painel não consegue exibir o aviso de permissão, então o pedido de
// microfone é descartado antes de o usuário responder. Uma aba normal consegue,
// e a concessão fica registrada para a origem da extensão — que é para onde o
// pedido delegado do iframe resolve — passando a valer dentro do painel.
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
