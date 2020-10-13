import * as crypto from 'crypto'
import ClientNode from './src/class/ClientNode'

const clientNode = new ClientNode()
const socket = clientNode.createSocket('localhost', 8333)
socket.on('connect', () => {
    socket.write(crypto.randomBytes(4))
})
clientNode.on('data', data => {
    if (!clientNode.verifyData(data)) return
    console.log(data)
    clientNode.broadcast(data)
})