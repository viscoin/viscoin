import * as net from 'net'
import * as crypto from 'crypto'
import * as config from '../../config.json'
interface Node {
    dataHashes: Array<String>
}
class Node {
    constructor() {
        this.dataHashes = []
    }
    onData(socket: net.Socket, data: Buffer) {
        console.log(Node.verifyData(data))
        const hash = crypto.createHash('sha256').update(data).digest('base64')
        if (this.dataHashes.find(e => e === hash)) return
        this.dataHashes.push(hash)
        if (this.dataHashes.length > config.dataHashesLength) this.dataHashes.shift()
        socket.write(data)
        console.log(data)
    }
    static verifyData(data) {
        if (Buffer.byteLength(data) > config.verifyData.maxSize) return false 
        return true
    }
}
export default Node