// Janela flutuante da extensão, injetada sob demanda em qualquer página.
// Reinjetar o arquivo apenas alterna a visibilidade, em vez de duplicar.
;(() => {
    const CHAVE = '__aiSidebarFloat'
    if (window[CHAVE]) {
        window[CHAVE].alternar()
        return
    }

    const MIN_L = 320
    const MIN_A = 380
    const MARGEM = 12

    const estado = {
        x: null, y: null, l: 420, a: 620,
        fixado: false, provedor: 'chatgpt', aberto: true,
    }

    const host = document.createElement('div')
    host.id = 'ai-sidebar-float-host'
    // A página não deve conseguir herdar nem vazar estilo para dentro.
    host.style.cssText = 'all:initial;position:fixed;inset:auto;z-index:2147483647'
    const raiz = host.attachShadow({ mode: 'closed' })

    const ICONE_FIXAR =
        '<path d="M12 17v5"/>' +
        '<path d="M9 10.76V7a3 3 0 0 1 6 0v3.76a2 2 0 0 0 .59 1.42L18 14.5V17H6v-2.5l2.41-2.32A2 2 0 0 0 9 10.76Z"/>'
    const ICONE_ACOPLAR = '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>'
    const ICONE_FECHAR = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
    const SVG = (conteudo, largura) =>
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + largura +
        '" stroke-linecap="round" stroke-linejoin="round">' + conteudo + '</svg>'

    const ESTILO = [
        ':host { all: initial; }',
        '* { box-sizing: border-box; font-family: "Segoe UI", system-ui, -apple-system, "Noto Sans", sans-serif; }',
        // Posição e tamanho vivem no host, não aqui: assim o elemento que a
        // página enxerga tem as dimensões reais da janela, em vez de zero.
        '.janela { position: relative; width: 100%; height: 100%;',
        '  display: flex; flex-direction: column;',
        '  background: #14182b; color: #e8ecf8; border: 1px solid #2c3352; border-radius: 14px;',
        '  box-shadow: 0 18px 48px rgba(0,0,0,.42), 0 4px 14px rgba(0,0,0,.28); overflow: hidden; }',
        '.barra { display: flex; align-items: center; gap: 8px; padding: 8px 10px;',
        '  background: #1b2038; border-bottom: 1px solid #2c3352; cursor: grab;',
        '  user-select: none; flex-shrink: 0; }',
        '.barra.arrastando { cursor: grabbing; }',
        '.pega { width: 14px; height: 18px; flex-shrink: 0; opacity: .5; }',
        'select { flex: 1; min-width: 0; background: #10142a; color: #e8ecf8;',
        '  border: 1px solid #2c3352; border-radius: 7px; padding: 5px 8px;',
        '  font-size: 12.5px; cursor: pointer; outline: none; }',
        '.acao { flex-shrink: 0; width: 28px; height: 28px; display: grid; place-items: center;',
        '  background: transparent; border: 1px solid transparent; border-radius: 7px;',
        '  color: #9aa6cc; cursor: pointer; padding: 0; }',
        '.acao:hover { background: #262d4d; color: #e8ecf8; }',
        '.acao.ativo { background: #1d4ed8; border-color: #3b6ae1; color: #fff; }',
        '.acao svg { width: 15px; height: 15px; display: block; }',
        'iframe { flex: 1; width: 100%; border: none; background: #fff; }',
        '.redimensionar { position: absolute; right: 0; bottom: 0; width: 18px; height: 18px;',
        '  cursor: nwse-resize; }',
        '.redimensionar::after { content: ""; position: absolute; right: 4px; bottom: 4px;',
        '  width: 7px; height: 7px; border-right: 2px solid #6b779e; border-bottom: 2px solid #6b779e; }',
    ].join('\n')

    const PEGA =
        '<svg class="pega" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">' +
        '<circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/>' +
        '<circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/>' +
        '<circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></svg>'

    raiz.innerHTML =
        '<style>' + ESTILO + '</style>' +
        '<div class="janela">' +
        '  <div class="barra">' + PEGA +
        '    <select id="prov" title="Trocar de provedor"></select>' +
        '    <button class="acao" id="fixar" title="Fixar: reabre sozinha em cada página">' +
        SVG(ICONE_FIXAR, 2) + '</button>' +
        '    <button class="acao" id="acoplar" title="Voltar ao painel lateral">' +
        SVG(ICONE_ACOPLAR, 2) + '</button>' +
        '    <button class="acao" id="fechar" title="Fechar">' + SVG(ICONE_FECHAR, 2.2) + '</button>' +
        '  </div>' +
        '  <iframe id="quadro" title="Provedor de IA" allow="microphone; camera; clipboard-read;' +
        ' clipboard-write; display-capture; autoplay; encrypted-media; fullscreen; picture-in-picture"></iframe>' +
        '  <div class="redimensionar" id="puxador"></div>' +
        '</div>'

    const barra = raiz.querySelector('.barra')
    const seletor = raiz.querySelector('#prov')
    const quadro = raiz.querySelector('#quadro')
    const btFixar = raiz.querySelector('#fixar')
    const puxador = raiz.querySelector('#puxador')

    for (const p of AI_PROVIDERS) {
        const opcao = document.createElement('option')
        opcao.value = p.id
        opcao.textContent = p.nome
        seletor.appendChild(opcao)
    }

    const limitar = () => {
        estado.l = Math.min(Math.max(estado.l, MIN_L), Math.max(MIN_L, innerWidth - MARGEM * 2))
        estado.a = Math.min(Math.max(estado.a, MIN_A), Math.max(MIN_A, innerHeight - MARGEM * 2))
        const maxX = Math.max(MARGEM, innerWidth - estado.l - MARGEM)
        const maxY = Math.max(MARGEM, innerHeight - estado.a - MARGEM)
        estado.x = Math.min(Math.max(estado.x === null ? maxX : estado.x, MARGEM), maxX)
        estado.y = Math.min(Math.max(estado.y === null ? MARGEM : estado.y, MARGEM), maxY)
    }

    const pintar = () => {
        limitar()
        host.style.left = estado.x + 'px'
        host.style.top = estado.y + 'px'
        host.style.width = estado.l + 'px'
        host.style.height = estado.a + 'px'
        host.style.display = estado.aberto ? 'block' : 'none'
        btFixar.classList.toggle('ativo', estado.fixado)
    }

    // Persistir é conveniência, não requisito: a janela funciona sem isso.
    const salvar = () => {
        try {
            chrome.storage.local.set({ flutuante: { ...estado } }).catch(() => {})
        } catch (e) {
            /* contexto da extensão invalidado após recarga */
        }
    }

    // --- arrastar e redimensionar --------------------------------------------
    // A barra de arrastar também hospeda o seletor e os botões. Sem esta
    // exceção, o pointerdown deles sobe até a barra, que chama preventDefault
    // e setPointerCapture — e o clique nunca chega ao controle.
    const eControle = (e) => !!(e.target.closest && e.target.closest('button, select, option'))

    const capturar = (alvo, aoMover, aoTerminar) => {
        alvo.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || eControle(e)) return
            e.preventDefault()
            alvo.setPointerCapture(e.pointerId)
            // O iframe engoliria os eventos de ponteiro durante o gesto.
            quadro.style.pointerEvents = 'none'
            const inicio = {
                px: e.clientX, py: e.clientY,
                x: estado.x, y: estado.y, l: estado.l, a: estado.a,
            }
            const mover = (ev) => { aoMover(ev, inicio); pintar() }
            const soltar = (ev) => {
                alvo.releasePointerCapture(ev.pointerId)
                alvo.removeEventListener('pointermove', mover)
                alvo.removeEventListener('pointerup', soltar)
                alvo.removeEventListener('pointercancel', soltar)
                quadro.style.pointerEvents = ''
                if (aoTerminar) aoTerminar()
                salvar()
            }
            alvo.addEventListener('pointermove', mover)
            alvo.addEventListener('pointerup', soltar)
            alvo.addEventListener('pointercancel', soltar)
        })
    }

    capturar(
        barra,
        (e, i) => { estado.x = i.x + (e.clientX - i.px); estado.y = i.y + (e.clientY - i.py) },
        () => barra.classList.remove('arrastando'),
    )
    barra.addEventListener('pointerdown', (e) => {
        if (!eControle(e)) barra.classList.add('arrastando')
    })

    capturar(puxador, (e, i) => {
        estado.l = i.l + (e.clientX - i.px)
        estado.a = i.a + (e.clientY - i.py)
    })

    // --- ações ----------------------------------------------------------------
    const trocarProvedor = (id) => {
        estado.provedor = providerExists(id) ? id : AI_PROVIDERS[0].id
        seletor.value = estado.provedor
        quadro.src = providerUrl(estado.provedor)
        chrome.storage.local.set({ selectedProvider: estado.provedor })
        salvar()
    }

    seletor.addEventListener('change', (e) => trocarProvedor(e.target.value))

    btFixar.addEventListener('click', () => {
        estado.fixado = !estado.fixado
        pintar()
        salvar()
    })

    raiz.querySelector('#acoplar').addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'USAR_PAINEL' })
        estado.aberto = false
        pintar()
        salvar()
    })

    raiz.querySelector('#fechar').addEventListener('click', () => {
        estado.aberto = false
        estado.fixado = false
        pintar()
        salvar()
    })

    addEventListener('resize', pintar)

    window[CHAVE] = {
        alternar: () => {
            estado.aberto = !estado.aberto
            pintar()
            salvar()
        },
    }

    // --- iniciar ---------------------------------------------------------------
    // A janela sobe primeiro, com os padrões. O estado salvo é aplicado depois,
    // se vier: antes isto ficava dentro do callback do storage, e uma falha de
    // leitura deixava a janela sem nunca ser anexada ao documento.
    document.documentElement.appendChild(host)
    trocarProvedor(estado.provedor)
    pintar()

    chrome.storage.local
        .get(['flutuante', 'selectedProvider'])
        .then(({ flutuante = {}, selectedProvider }) => {
            Object.assign(estado, flutuante, { aberto: true })
            const escolhido = flutuante.provedor || selectedProvider
            if (escolhido && escolhido !== estado.provedor) trocarProvedor(escolhido)
            pintar()
        })
        .catch(() => { /* sem estado salvo: seguem os padrões já pintados */ })
})()
