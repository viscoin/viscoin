import * as crypto from 'crypto'
import ClientNode from './src/class/ClientNode'
import * as config from './config.json'

const clientNode = new ClientNode()
const socket = clientNode.createSocket(config.port, 'localhost')
socket.on('connect', () => {
    socket.write(Buffer.from(Buffer.alloc(1, 0) + JSON.stringify(crypto.randomBytes(16))))
})
clientNode.on('data', data => {
    if (!clientNode.verifyData(data)) return
    const processed = clientNode.processData(data)
    if (!processed) return
    console.log(processed)
})