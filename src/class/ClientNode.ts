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
            // .on('connect', () => {
            //     socket.write('0')
            // })
        for (const _socket of this.sockets) {
            socket.on('data', data => this.onData(_socket, data))
            _socket.on('data', data => this.onData(socket, data))
        }
        this.sockets.push(socket)
    }
}
export default ClientNode