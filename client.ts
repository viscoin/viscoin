import * as crypto from 'crypto'
import ClientNode from './src/class/ClientNode'
import * as config from './config.json'
import * as nodes from './nodes.json'
import * as net from 'net'

const clientNode = new ClientNode()
for (const node of nodes) {
    const socket = clientNode.createSocket(node.port, node.address)
    if (!socket) continue
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