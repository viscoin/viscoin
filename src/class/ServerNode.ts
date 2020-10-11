import * as net from 'net'
import Node from './Node'
interface ServerNode extends Node {
    server: net.Server
    sockets: Array<net.Socket>
}
class ServerNode extends Node {
    constructor() {
        super()
        this.server = new net.Server()
        this.sockets = []
    }
    start(ip: string, port: number) {
        this.server
            .on('listening', () => {
                console.log(this.server.address())
            })
            .on('connection', socket => {
                for (const _socket of this.sockets) {
                    socket.on('data', data => this.onData(_socket, data))
                    _socket.on('data', data => this.onData(socket, data))
                }
                this.sockets.push(socket)
            })
            .on('error', err => {
                throw err
            })
            .listen(port, ip)
    }
    stop() {
        this.server.close()
    }
}
export default ServerNode