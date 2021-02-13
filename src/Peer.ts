import * as configSettings from '../config/settings.json'
import * as net from 'net'
import * as events from 'events'
import * as crypto from 'crypto'
import protocol from './protocol'
interface Peer extends events.EventEmitter {
    socket: net.Socket
    bytesRead: number
    bytesWritten: number
    buffer: Buffer
    requests: number
    settings: {

    }
    index: number
}
class Peer extends events.EventEmitter {
    constructor(socket: net.Socket) {
        super()
        this.socket = socket
        this.bytesRead = this.bytesRead
        this.bytesWritten = this.bytesWritten
        this.buffer = Buffer.alloc(0)
        this.requests = 0
        // this.settings = {}
        // this.index = 0
        setInterval(this.interval['1s'].bind(this), 1000)
        this.socket.setTimeout(configSettings.TCPNode.socket.setTimeout)
        if (this.socket.connecting === false) this.emit('add')
        this.socket
            .on('connect', () => this.emit('add'))
            .on('error', () => {})
            .on('close', () => this.del())
            .on('timeout', () => this.emit('ban'))
            .on('data', chunk => this.onData(chunk))
            .on('ban', () => this.del())
    }
    interval = {
        '1s': () => {
            this.bytesRead = this.socket.bytesRead
            this.bytesWritten = this.socket.bytesWritten
            this.requests = 0
        }
    }
    del() {
        this.socket.destroy()
        // this.socket.removeAllListeners()
        this.emit('del')
    }
    onData(chunk: Buffer) {
        if (this.socket.bytesRead - this.bytesRead > configSettings.TCPNode.socket.maxBytesPerSecond) return this.emit('ban')
        this.buffer = Buffer.concat([ this.buffer, chunk ])
        if (Buffer.byteLength(this.buffer) > configSettings.TCPNode.socket.maxBytesInMemory) return this.emit('ban')
        this.extract()
    }
    async extract() {
        let index = protocol.getEndIndex(this.buffer)
        while (index !== -1 && this.socket.destroyed === false) {
            if (configSettings.TCPNode.socket.maxRequestsPerSecond !== 0
            && ++this.requests > configSettings.TCPNode.socket.maxRequestsPerSecond) {
                if (configSettings.TCPNode.socket.onAbuseRequestsBehaviour === 'continue') continue
                else if (configSettings.TCPNode.socket.onAbuseRequestsBehaviour === 'ban') return this.emit('ban')
            }
            const a = index + Buffer.byteLength(protocol.end)
            const b = this.buffer.slice(0, a) 
            this.buffer = this.buffer.slice(a)
            const c = b.slice(0, 32)
            const d = b.slice(32, a - Buffer.byteLength(protocol.end))
            if (Buffer.byteLength(c) > 0
            && Buffer.byteLength(d) > 0) {
                if (crypto.createHash('sha256').update(d).digest().equals(c) === false) continue
                const parsed = protocol.parse(d)
                if (parsed === null) continue
                const { type, data } = parsed
                console.log(parsed)
                this.emit(type, data, b)
            }
            index = protocol.getEndIndex(this.buffer)
        }
    }
}
export default Peer