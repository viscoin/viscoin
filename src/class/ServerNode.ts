import * as net from 'net'
import * as config from '../../config.json'
import Node from './Node'
interface ServerNode extends Node {
    server: net.Server
    maxConnections: number
}
class ServerNode extends Node {
    constructor(maxConnections: number = config.limit.serverNodeConnections) {
        super()
        this.server = new net.Server()
        this.server.maxConnections = maxConnections
    }
    start(port: number, address: string) {
        this.server
            .on('connection', socket => this.emit('socket', socket))
            .on('listening', () => this.emit('listening'))
            .on('close', () => {})
            .on('error', () => {})
            .listen(port, address)
    }
    stop() {
        this.server.close()
    }
}
export default ServerNode