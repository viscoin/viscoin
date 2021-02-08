import * as net from 'net'
import * as events from 'events'
import * as configSettings from '../config/settings.json'
import * as configNetwork from '../config/network.json'
import protocol from './protocol'
interface Socket extends net.Socket {
    data: Buffer
}
interface Server {
    sockets: Set<net.Socket>
    server: net.Server
}
class Server extends events.EventEmitter {
    constructor() {
        super()
        this.sockets = new Set()
        this.server = new net.Server()
        this.server.maxConnections = configSettings.TCPApi.maxConnections
        this.server
            .on('connection', (socket: net.Socket) => {
                this.sockets.add(socket)
                socket.on('error', () => {})
                socket.on('close', () => this.sockets.delete(socket))
                socket.on('data', () => socket.destroy())
                this.emit('connection', socket.remotePort, socket.remoteAddress)
            })
            .on('listening', () => this.emit('listening'))
            .on('error', e => this.emit('error', e))
            .on('close', () => {})
    }
    start() {
        this.server.listen(configNetwork.TCPApi.port, configNetwork.TCPApi.address)
    }
    stop() {
        this.server.close()
    }
    broadcast(buffer: Buffer) {
        for (const socket of this.sockets) {
            socket.write(buffer)
            socket.write(protocol.end)
        }
    }
}
interface Client {
    sockets: Set<net.Socket>
}
class Client extends events.EventEmitter {
    constructor() {
        super()
        this.sockets = new Set()
    }
    connect(port: number, host: string, autoReconnect: boolean = false) {
        const socket = <Socket> net.connect(port, host)
        socket.data = Buffer.alloc(0)
        socket.on('connect', () => {
            this.sockets.add(socket)
            this.emit('connect', port, host)
        })
        socket.on('error', () => {})
        socket.on('close', () => {
            this.sockets.delete(socket)
            if (autoReconnect) setTimeout(() => this.connect(port, host, autoReconnect), configSettings.TCPApi.autoReconnect)
        })
        socket.on('data', chunk => {
            socket.data = Buffer.concat([ socket.data, chunk ])
            let index = protocol.getEndIndex(socket.data)
            while (index !== -1 && !socket.destroyed) {
                const buffer = socket.data.slice(0, index)
                socket.data = socket.data.slice(index + Buffer.byteLength(protocol.end))
                if (Buffer.byteLength(buffer) !== 0) {
                    const parsed = protocol.parse(buffer)
                    if (parsed === null) continue
                    const { type, data } = parsed
                    this.emit(type, data)
                }
                index = protocol.getEndIndex(socket.data)
            }
        })
    }
}
interface TCPApi {
    Server: Server
    Client: Client
}
class TCPApi {
    static createServer() {
        return new Server()
    }
    static createClient() {
        return new Client()
    }
}
export default TCPApi