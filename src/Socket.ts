import * as configSettings from '../config/settings.json'
import * as net from 'net'
import * as crypto from 'crypto'
import protocol from './protocol'
interface Socket extends net.Socket {
    buffer: Buffer
    bytesReadLastSecond: number
    requests: number
    settings: {

    }
    index: number
}
class Socket implements Socket {
    constructor() {
        this.buffer = Buffer.alloc(0)
        this.bytesReadLastSecond = this.bytesRead
        this.requests = 0
        this.setTimeout(configSettings.TCPNode.socket.setTimeout)
        setInterval(this.clear.bind(this), 1000)
        if (this.connecting === false) this.add()
        this
            .on('connect', () => this.add())
            .on('error', () => this.del())
            .on('close', () => this.del())
            .on('timeout', () => this.emit('ban'))
            .on('data', chunk => this.onData(chunk))
            .on('ban', () => this.del())
    }
    add() {
        this.emit('add')
    }
    del() {
        this.destroy()
        this.removeAllListeners()
        this.emit('del')
    }
    clear() {
        this.bytesReadLastSecond = 0
        this.requests = 0
    }
    async onData(chunk: Buffer) {
        const byteLength = Buffer.byteLength(chunk)
        this.bytesReadLastSecond += byteLength
        if (this.bytesReadLastSecond > configSettings.TCPNode.socket.maxBytesPerSecond) return this.emit('ban')
        this.buffer = Buffer.concat([
            this.buffer,
            chunk
        ])
        if (Buffer.byteLength(this.buffer) > configSettings.TCPNode.socket.maxBytesInMemory) return this.emit('ban')
        let index = protocol.getEndIndex(this.buffer)
        while (index !== -1 && !this.destroyed) {
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
export default Socket