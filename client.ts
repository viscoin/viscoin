import * as crypto from 'crypto'
import ClientNode from './src/class/ClientNode'
import * as config from './config.json'
import * as addresses from './addresses.json'

const clientNode = new ClientNode()
for (const address of addresses) {
    const socket = clientNode.createSocket(config.network.port, address)
    socket.on('connect', () => {
        socket.write(Buffer.from(Buffer.alloc(1, 0) + JSON.stringify(crypto.randomBytes(16))))
    })
}
clientNode.on('data', data => {
    if (!clientNode.verifyData(data)) return
    const processed = clientNode.processData(data)
    if (!processed) return
    console.log(processed)
})