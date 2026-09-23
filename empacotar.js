// Monta o ZIP para enviar à Chrome Web Store.
//
// Inclui só o que a extensão executa. Ficam de fora: o código de terceiros da
// pasta Gemini-Sidebar, as imagens do README, os assets de divulgação, backups
// e o próprio .git — nada disso roda, e o pacote é revisado por humanos.
//
//   node empacotar.js
//
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const RAIZ = __dirname
const SAIDA = path.join(RAIZ, 'dist')

// Tudo que a extensão carrega em tempo de execução.
const ARQUIVOS = [
    'manifest.json',
    'background.js',
    'content.js',
    'floating.js',
    'i18n.js',
    'providers.js',
    'sidepanel.html',
    'sidepanel.js',
    'permission.html',
    'permission.js',
    'icon.png',
    'icon-48.png',
    'icon-16.png',
]

const conferir = () => {
    const faltando = ARQUIVOS.filter((f) => !fs.existsSync(path.join(RAIZ, f)))
    if (faltando.length) {
        console.error('Arquivos ausentes:', faltando.join(', '))
        process.exit(1)
    }

    const m = JSON.parse(fs.readFileSync(path.join(RAIZ, 'manifest.json'), 'utf8'))
    if (m.update_url) {
        console.error('manifest.json ainda tem update_url — a Web Store recusa o pacote')
        process.exit(1)
    }

    // Todo arquivo citado no manifest precisa estar na lista.
    const citados = [
        m.background?.service_worker,
        m.side_panel?.default_path,
        ...Object.values(m.icons || {}),
        ...Object.values(m.action?.default_icon || {}),
        ...(m.content_scripts || []).flatMap((c) => c.js || []),
    ].filter(Boolean)
    const esquecidos = [...new Set(citados)].filter((f) => !ARQUIVOS.includes(f))
    if (esquecidos.length) {
        console.error('Citados no manifest e fora do pacote:', esquecidos.join(', '))
        process.exit(1)
    }

    return m
}

const manifest = conferir()
const locales = fs.readdirSync(path.join(RAIZ, '_locales'))
const zip = path.join(SAIDA, `ai-sidebar-${manifest.version}.zip`)

fs.mkdirSync(SAIDA, { recursive: true })
if (fs.existsSync(zip)) fs.unlinkSync(zip)

// Compress-Archive grava os caminhos com barra invertida, que o formato ZIP não
// admite e o envio à loja recusa. As entradas são criadas uma a uma, com o nome
// exato em barra normal.
const entradas = [
    ...ARQUIVOS,
    ...fs
        .readdirSync(path.join(RAIZ, '_locales'))
        .map((loc) => `_locales/${loc}/messages.json`)
        .filter((rel) => fs.existsSync(path.join(RAIZ, rel))),
]

const ps = [
    'Add-Type -AssemblyName System.IO.Compression',
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    `$zip = [System.IO.Compression.ZipFile]::Open('${zip}', 'Create')`,
    ...entradas.map((rel) =>
        `[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, ` +
        `'${path.join(RAIZ, rel)}', '${rel}', 'Optimal') | Out-Null`),
    '$zip.Dispose()',
].join('; ')

execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'inherit' })

const kb = (fs.statSync(zip).size / 1024).toFixed(1)
console.log(`\n${path.basename(zip)}  —  ${kb} KB`)
console.log(`  ${ARQUIVOS.length} arquivos + _locales (${locales.length} idiomas)`)
console.log(`  versão ${manifest.version}`)
console.log(`\n  ${zip}`)
