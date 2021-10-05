import * as net from 'net'
import * as events from 'events'
import * as config_settings from '../config/settings.json'
import protocol from './protocol'
import log from './log'
import * as config_default_env from '../config/default_env.json'

interface Socket extends net.Socket {
    data: Buffer
}
interface Server {
    sockets: Set<net.Socket>
    server: net.Server
    TCP_API: {
        host: string
        port: number
    }
}
class Server extends events.EventEmitter {
    constructor() {
        super()
        const TCP_API = process.env.TCP_API || config_default_env.TCP_API
        this.TCP_API = {
            host: TCP_API.split(':').slice(0, -1).join(':'),
            port: parseInt(TCP_API.split(':').reverse()[0])
        }
        if (process.env.TCP_API) log.info('Using TCP_API:', this.TCP_API)
        else log.warn('Unset environment value! Using default value for TCP_API:', this.TCP_API)
        this.sockets = new Set()
        this.server = new net.Server()
        this.server.maxConnections = config_settings.TCPApi.maxConnectionsIn
        this.server
            .on('connection', (socket: net.Socket) => {
                this.sockets.add(socket)
                socket.on('error', e => log.error('TCP_API Socket', e))
                socket.on('close', () => {
                    log.info('TCP_API Socket close')
                    this.sockets.delete(socket)
                })
                socket.on('data', () => {
                    log.warn('TCP_API Socket sent data', socket.address())
                    socket.destroy()
                })
                this.emit('connection', socket.remotePort, socket.remoteAddress)
                log.info('TCP_API Socket connection', socket.address())
            })
            .on('listening', () => log.info('TCP_API listening', this.server.address()))
            .on('error', e => log.error('TCP_API', e))
            .on('close', () => log.warn('TCP_API close'))
    }
    start() {
        this.server.listen(this.TCP_API.port, this.TCP_API.host)
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
        socket.once('connect', () => {
            this.sockets.add(socket)
            log.info('TCP_API Socket connect', `${socket.remoteAddress}:${socket.remotePort}`)
        })
        socket.once('close', e => {
            this.sockets.delete(socket)
            if (autoReconnect) setTimeout(() => this.connect(port, host, autoReconnect), config_settings.TCPApi.autoReconnect)
            if (e) return log.warn('Connection failed', `${host}:${port}`)
            log.info('TCP_API Socket close', `${host}:${port}`)
        })
        socket.on('error', e => log.debug(2, 'TCP_API Socket', e))
        socket.on('data', chunk => {
            log.debug(3, 'TCP_API Socket data')
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