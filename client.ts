import * as crypto from 'crypto'
import ClientNode from './src/class/ClientNode'

const clientNode = new ClientNode()
const socket = clientNode.createSocket('localhost', 8333)
socket.on('connect', () => {
    socket.write(Buffer.from(Buffer.alloc(1, 0) + JSON.stringify({ hey: 1 })))
})
clientNode.on('data', data => {
    if (!clientNode.verifyData(data)) return
    const processed = clientNode.processData(data)
    if (!processed) return
    console.log(processed)
})