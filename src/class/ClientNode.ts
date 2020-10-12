import * as net from 'net'
import Node from './Node'
interface ClientNode extends Node {
    sockets: Array<net.Socket>
}
class ClientNode extends Node {
    constructor() {
        super()
        this.sockets = []
    }
    createClient(ip: string, port: number) {
        const socket = net.connect(port, ip)
            .on('close', () => {
                this.sockets.splice(this.sockets.indexOf(socket), 1)
            })
            .on('error', err => {
                if (err) throw err
            })
        for (const _socket of this.sockets) {
            socket.on('data', data => this.onData(_socket, data))
            _socket.on('data', data => this.onData(socket, data))
        }
        this.sockets.push(socket)
        return socket
    }
}
export default ClientNode