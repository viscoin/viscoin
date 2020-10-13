import * as net from 'net'
import * as crypto from 'crypto'
import * as events from 'events'
import * as config from '../../config.json'
interface Node {
    dataHashes: Array<Buffer>
    sockets: Array<net.Socket>
}
class Node extends events.EventEmitter {
    constructor() {
        super()
        this.dataHashes = []
        this.sockets = []
    }
    verifyData(data: Buffer) {
        if (Buffer.byteLength(data) > config.byteLength.verifyData) return false
        const hash = crypto.createHash('sha256').update(data).digest()
        if (this.dataHashes.find(e => e.compare(hash) === 0)) return false
        this.dataHashes.push(hash)
        if (this.dataHashes.length > config.length.dataHashes) this.dataHashes.shift()
        return true
    }
    broadcast(data: Buffer) {
        if (!this.verifyData(data)) return
        for (const socket of this.sockets) {
            socket.write(data)
        }
    }
}
export default Node