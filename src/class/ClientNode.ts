import * as net from 'net'
import Node from './Node'
interface ClientNode extends Node {
}
class ClientNode extends Node {
    constructor() {
        super()
    }
    createSocket(port: number, address: string) {
        const socket = net.connect(port, address)
        this.addSocket(socket)
        socket.on('data', data => this.emit('data', data))
        return socket
    }
}
export default ClientNode