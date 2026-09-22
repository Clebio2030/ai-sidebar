const applySessionRules = () =>
  chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [
      {
        id: 1,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            { header: 'Content-Security-Policy', operation: 'remove' },
            { header: 'Content-Security-Policy-Report-Only', operation: 'remove' },
            { header: 'X-Frame-Options', operation: 'remove' },
            // Sites (Gemini/Copilot) ship a Permissions-Policy that disables the
            // microphone and the Clipboard API inside embedded frames.
            { header: 'Permissions-Policy', operation: 'remove' },
            { header: 'Feature-Policy', operation: 'remove' },
          ],
          requestHeaders: [
            { header: 'sec-fetch-dest', operation: 'set', value: 'document' },
            { header: 'sec-fetch-site', operation: 'set', value: 'same-origin' },
          ],
        },
        condition: {
          resourceTypes: ['sub_frame'],
        },
      },
    ],
  })

const init = async () => {
  await applySessionRules()
  await aplicarModo(await lerModo())
}


// Aside has no scheme of its own: its internal pages are chrome:// too
// (chrome://aside-adblock, chrome://aside-import-data), so this list covers it.
const RESTRICTED_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "chrome-untrusted://",
  "devtools://",
  "edge://",
  "about:",
  "view-source:",
  "https://chrome.google.com/webstore",
  "https://chromewebstore.google.com",
]

const isRestrictedUrl = (url) => !url || RESTRICTED_PREFIXES.some((prefix) => url.startsWith(prefix))

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))])

// Runs in the target page, so it must stay self-contained - no outer scope.
const extractPageContent = () => {
  const body = document.body.cloneNode(true)
  body.querySelectorAll("script, style, nav, footer, header, noscript, svg, iframe").forEach((el) => el.remove())
  const text = (body.innerText || body.textContent || "").replace(/\s+/g, " ").trim()
  return { content: text.slice(0, 12000), url: location.href, title: document.title }
}

// Querying only by { active, windowType } returns one active tab per normal
// window and picking the first is arbitrary. Prefer the window this panel is
// in, then the last focused one, before falling back to any normal window.
const findActiveTab = async () => {
  const queries = [
    { active: true, currentWindow: true },
    { active: true, lastFocusedWindow: true },
    { active: true, windowType: "normal" },
  ]
  for (const query of queries) {
    try {
      const tabs = await chrome.tabs.query(query)
      const tab = tabs.find((candidate) => candidate.id && !isRestrictedUrl(candidate.url))
      if (tab) return tab
    } catch (error) {
      /* query shape unsupported here - try the next one */
    }
  }
  const [fallback] = await chrome.tabs.query({ active: true, windowType: "normal" })
  return fallback
}

const getActiveTabContent = async () => {
  const tab = await findActiveTab()
  if (!tab?.id || isRestrictedUrl(tab.url)) return { error: "protected", url: tab?.url }
  try {
    const results = await withTimeout(
      chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPageContent }),
      5000,
    )
    const result = results?.[0]?.result
    if (!result?.content) return { error: "empty", url: tab.url }
    return result
  } catch (error) {
    return { error: error.message, url: tab.url }
  }
}

// --- modo de exibicao: painel lateral ou janela flutuante ------------------

const MODO_PADRAO = "painel"

const lerModo = async () => (await chrome.storage.local.get("modo")).modo || MODO_PADRAO

// Com openPanelOnActionClick ligado o clique abre o painel e action.onClicked
// nao dispara. Desligar e o que libera o clique para a janela flutuante.
const aplicarModo = (modo) =>
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: modo === "painel" })
    .catch((error) => console.error("Side Panel Error:", error))

// A intencao viaja numa variavel do mundo isolado porque executeScript com
// "files" nao aceita argumentos. Sem ela, reinjetar para mostrar a janela
// fixada faria o contrario: alternar, escondendo-a.
const injetarFlutuante = async (tabId, intencao = "alternar") => {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (valor) => { window.__aiSidebarIntencao = valor },
    args: [intencao],
  })
  return chrome.scripting.executeScript({
    target: { tabId },
    files: ["providers.js", "floating.js"],
  })
}

const definirModo = async (modo, tab) => {
  await chrome.storage.local.set({ modo })
  await aplicarModo(modo)
  if (modo === "flutuante" && tab?.id && !isRestrictedUrl(tab.url)) {
    await injetarFlutuante(tab.id, "mostrar").catch(() => {})
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  // So chega aqui no modo flutuante; no modo painel o clique abre o painel.
  if (!tab?.id) return
  if (isRestrictedUrl(tab.url)) return
  await injetarFlutuante(tab.id, "alternar")
    .catch((error) => console.warn("Injecao falhou:", error?.message))
})

const estaFixada = async () => {
  const { modo, flutuante } = await chrome.storage.local.get(["modo", "flutuante"])
  return modo === "flutuante" && !!flutuante?.fixado
}

const talvezMostrar = async (tabId, url) => {
  if (!tabId || isRestrictedUrl(url)) return
  if (!(await estaFixada())) return
  injetarFlutuante(tabId, "mostrar").catch(() => {})
}

// Fixada, a janela acompanha navegacoes e abas novas...
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status !== "complete") return
  talvezMostrar(tabId, tab?.url)
})

// ...e tambem a simples troca de aba: onUpdated so dispara em navegacao, entao
// uma aba ja carregada nunca receberia a janela ao ser reativada.
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null)
  if (tab) talvezMostrar(tabId, tab.url)
})
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.action === "USAR_PAINEL") {
    // Precisa vir ANTES de qualquer await: sidePanel.open() exige gesto do
    // usuario, e o gesto nao sobrevive a um await. Chamar depois de trocar o
    // modo fazia a janela fechar sem o painel abrir.
    const janela = sender.tab?.windowId
    if (janela !== undefined) {
      Promise.resolve(chrome.sidePanel.open({ windowId: janela }))
        .catch((error) => console.warn("sidePanel.open recusado:", error?.message))
    }
    definirModo("painel", sender.tab)
    return
  }
  if (request?.action === "USAR_FLUTUANTE") {
    // Responde se deu certo: o painel so deve se fechar quando a janela
    // realmente abriu. Antes ele fechava sempre, e numa aba restrita o
    // usuario ficava sem painel e sem janela.
    ;(async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
      if (!tab?.id || isRestrictedUrl(tab.url)) {
        sendResponse({ ok: false, motivo: "restrita", url: tab?.url })
        return
      }
      try {
        await injetarFlutuante(tab.id, "mostrar")
        await chrome.storage.local.set({ modo: "flutuante" })
        await aplicarModo("flutuante")
        sendResponse({ ok: true })
      } catch (error) {
        sendResponse({ ok: false, motivo: error?.message, url: tab.url })
      }
    })()
    return true // resposta assincrona
  }
  if (request?.action !== "GET_ACTIVE_TAB_CONTENT") return
  getActiveTabContent().then(sendResponse)
  return true // keep the channel open for the async reply
})

chrome.runtime.onInstalled.addListener(() => {
  init()
  chrome.contextMenus.create({
    id: 'send-to-ai',
    title: chrome.i18n.getMessage('sendToSidebar'),
    contexts: ['selection'],
  })
})

chrome.runtime.onStartup.addListener(init)

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'send-to-ai' && info.selectionText) {
    chrome.storage.local.set({ pendingText: info.selectionText })
    chrome.sidePanel.open({ windowId: tab.windowId })
  }
})

// Session rules die with the browser session and the MV3 worker is torn down
// aggressively, so re-assert state on every wake-up, not just on install.
// Fica no fim do arquivo porque init() depende de tudo que vem acima.
init()
