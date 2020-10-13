import * as net from 'net'
import * as config from '../../config.json'
import Node from './Node'
interface ServerNode extends Node {
    server: net.Server
    maxConnections: number
}
class ServerNode extends Node {
    constructor(maxConnections = config.limit.serverNodeConnections) {
        super()
        this.server = new net.Server()
        this.server.maxConnections = maxConnections
    }
    start(ip: string, port: number) {
        this.server
            .on('connection', socket => {
                socket
                    .on('data', data => this.emit('data', data))
                    .on('error', () => {})
                    .on('close', () => this.sockets.splice(this.sockets.indexOf(socket), 1))
                this.sockets.push(socket)
            })
            .listen(port, ip)
    }
    stop() {
        this.server.close()
    }
}
export default ServerNode