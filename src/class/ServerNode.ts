import * as net from 'net'
import * as config from '../../config.json'
import Node from './Node'
interface ServerNode extends Node {
    server: net.Server
    sockets: Array<net.Socket>
    maxConnections: number
}
class ServerNode extends Node {
    constructor(maxConnections = config.maxServerNodeConnections) {
        super()
        this.server = new net.Server()
        this.server.maxConnections = maxConnections
        this.sockets = []
    }
    start(ip: string, port: number) {
        this.server
            .on('listening', () => {
                console.log(this.server.address())
            })
            .on('connection', socket => {
                socket.on('close', () => {
                    this.sockets.splice(this.sockets.indexOf(socket), 1)
                })
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