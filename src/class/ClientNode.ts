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
        this.emit('socket', socket)
        return socket
    }
}
export default ClientNode