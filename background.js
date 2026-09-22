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

const injetarFlutuante = (tabId) =>
  chrome.scripting.executeScript({
    target: { tabId },
    files: ["providers.js", "floating.js"],
  })

const definirModo = async (modo, tab) => {
  await chrome.storage.local.set({ modo })
  await aplicarModo(modo)
  if (modo === "flutuante" && tab?.id && !isRestrictedUrl(tab.url)) {
    await injetarFlutuante(tab.id).catch(() => {})
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  // So chega aqui no modo flutuante; no modo painel o clique abre o painel.
  if (!tab?.id) return
  if (isRestrictedUrl(tab.url)) return
  await injetarFlutuante(tab.id).catch((error) => console.warn("Injecao falhou:", error?.message))
})

// Fixada, a janela volta sozinha a cada navegacao e em cada aba nova.
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete") return
  const { modo, flutuante } = await chrome.storage.local.get(["modo", "flutuante"])
  if (modo !== "flutuante" || !flutuante?.fixado) return
  if (isRestrictedUrl(tab?.url)) return
  injetarFlutuante(tabId).catch(() => {})
})
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.action === "USAR_PAINEL") {
    definirModo("painel", sender.tab).then(() => {
      // Trocar o modo so faz o proximo clique no icone abrir o painel; abrir
      // agora exige gesto do usuario e pode ser recusado - dai o catch.
      const janela = sender.tab?.windowId
      if (janela === undefined) return
      Promise.resolve(chrome.sidePanel.open({ windowId: janela })).catch(() => {})
    })
    return
  }
  if (request?.action === "USAR_FLUTUANTE") {
    chrome.tabs
      .query({ active: true, lastFocusedWindow: true })
      .then(([tab]) => definirModo("flutuante", tab))
    return
  }
  if (request?.action !== "GET_ACTIVE_TAB_CONTENT") return
  getActiveTabContent().then(sendResponse)
  return true // keep the channel open for the async reply
})

chrome.runtime.onInstalled.addListener(() => {
  init()
  chrome.contextMenus.create({
    id: 'send-to-ai',
    title: 'Send to AI Sidebar',
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
