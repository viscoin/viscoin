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
        this.server.maxConnections = configSettings.TCPApi.maxConnectionsIn
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
        this.server.listen(configNetwork.TCPApi.port, configNetwork.TCPApi.host)
    }
    stop() {
        this.server.close()
    }
    broadcast(data: Buffer) {
        return <Promise<void>> new Promise(resolve => {
            if (this.sockets.size === 0) resolve()
            let i = 0
            for (const socket of this.sockets) {
                socket.write(data, () => {
                    if (++i === this.sockets.size) resolve()
                })
            }
        })
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
            this.emit('disconnect', port, host)
        })
        socket.on('data', chunk => {
            socket.data = Buffer.concat([ socket.data, chunk ])
            let index = protocol.getEndIndex(socket.data)
            while (index !== -1 && !socket.destroyed) {
                const a = index + Buffer.byteLength(protocol.end)
                const b = socket.data.slice(0, a) 
                socket.data = socket.data.slice(a)
                const d = b.slice(0, a - Buffer.byteLength(protocol.end))
                if (Buffer.byteLength(d) > 0) {
                    const parsed = protocol.parse(d)
                    if (parsed !== null) {
                        const { type, data } = parsed
                        this.emit(type, data, socket)
                    }
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