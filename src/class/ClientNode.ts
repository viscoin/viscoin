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
            .on('data', data => this.emit('data', data))
            .on('error', () => {})
            .on('close', () => this.sockets.splice(this.sockets.indexOf(socket), 1))
        this.sockets.push(socket)
        return socket
    }
}
export default ClientNode