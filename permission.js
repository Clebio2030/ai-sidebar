const button = document.getElementById('grant')
const status = document.getElementById('status')

const show = (message, kind) => {
    status.textContent = message
    status.className = kind
}

const report = async () => {
    try {
        const { state } = await navigator.permissions.query({ name: 'microphone' })
        if (state === 'granted') {
            show('Microfone já liberado. Pode fechar esta aba e reabrir o painel.', 'ok')
            button.disabled = true
        }
    } catch (error) {
        /* navegador sem a API de consulta: segue com o botão habilitado */
    }
}

button.addEventListener('click', async () => {
    button.disabled = true
    show('Aguardando sua resposta no aviso do navegador…', '')
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop())
        show('Pronto. Feche esta aba e reabra o painel lateral.', 'ok')
    } catch (error) {
        show(error.name + ': ' + error.message, 'err')
        button.disabled = false
    }
})

report()
