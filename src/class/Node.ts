import * as net from 'net'
import * as crypto from 'crypto'
import * as config from '../../config.json'
interface Node {
    dataHashes: Array<Buffer>
}
class Node {
    constructor() {
        this.dataHashes = []
    }
    onData(socket: net.Socket, data: Buffer) {
        if (!this.verifyData(data)) return
        socket.write(data)
        console.log(data)
    }
    verifyData(data) {
        if (Buffer.byteLength(data) > config.byteLength.verifyData) return false
        const hash = crypto.createHash('sha256').update(data).digest()
        if (this.dataHashes.find(e => e.compare(hash) === 0)) return false
        this.dataHashes.push(hash)
        if (this.dataHashes.length > config.length.dataHashes) this.dataHashes.shift()
        return true
    }
}
export default Node