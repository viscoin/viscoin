import Block from "./Block"
import Transaction from "./Transaction"

const types = [
    'block',
    'transaction',
    'node',
    'sync',
    'blocks',
    'meta'
] as const
type types_string = typeof types[number]
export default {
    types,
    getType(type: types_string | number): types_string | number {
        if (typeof type === 'string') {
            if (this.types.indexOf(type) !== -1) return this.types.indexOf(type)
            return null
        }
        else if (typeof type === 'number') {
            if (this.types[type]) return this.types[type]
            return null
        }
        return null
    },
    constructBuffer(type: types_string | number, data: object | number | string) {
        const buffer = data instanceof Buffer ? data : Buffer.from(JSON.stringify(data), 'binary')
        return Buffer.concat([
            Buffer.alloc(1, this.getType(type)),
            buffer,
            this.end
        ])
    },
    parse(buffer: Buffer) {
        try {
            const type = this.getType(buffer[0])
            let data = JSON.parse(buffer.slice(1).toString('binary'))
            switch (type) {
                case 'blocks':
                    data = data.map(e => Block.spawn(e))
                    break
                case 'block':
                    data = Block.spawn(data)
                    break
                case 'transaction':
                    data = Transaction.spawn(data)
                    break
                case 'node':
                    break
                case 'sync':
                    data = parseInt(data)
                    break
                case 'meta':
                    data = {
                        address: Buffer.from(data.address),
                        timestamp: data.timestamp,
                        hash: Buffer.from(data.hash),
                        signature: {
                            signature: Buffer.from(data.signature.signature),
                            recid: data.signature.recid
                        },
                        onion: data.onion
                    }
                    break
                default:
                    return null
            }
            return {
                type,
                data
            }
        }
        catch {
            return null
        }
    },
    end: Buffer.concat([
        Buffer.alloc(32, 0),
        Buffer.alloc(32, 0xff)
        // Buffer.alloc(16, 0),
        // Buffer.alloc(16, 0xff)
    ]),
    getEndIndex(data: Buffer) {
        return data.indexOf(this.end)
    }
}