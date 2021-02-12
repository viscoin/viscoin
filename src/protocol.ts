import Block from "./Block"
import Transaction from "./Transaction"
import * as crypto from 'crypto'

const types = [
    'post-block',
    'post-transaction',
    'post-node',
    'get-block'
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
    constructDataBuffer(type: types_string | number, data: object | number) {
        const buffer = Buffer.concat([
            Buffer.alloc(1, this.getType(type)),
            Buffer.from(JSON.stringify(data), 'binary')
        ])
        return Buffer.concat([
            crypto.createHash('sha256').update(buffer).digest(),
            buffer,
            this.end
        ])
    },
    parse(buffer: Buffer) {
        try {
            const type = this.getType(buffer[0])
            if (type === null) return null
            let data = JSON.parse(buffer.slice(1).toString('binary'))
            switch (type) {
                case 'post-block':
                    data = new Block(Block.beautify(data))
                    break
                case 'post-transaction':
                    data = new Transaction(Transaction.beautify(data))
                    break
                case 'post-node':
                    data = {
                        port: data.port,
                        address: data.address
                    }
                    break
                case 'get-block':
                    // data = parseInt(data)
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
    ]),
    getEndIndex(data: Buffer) {
        return data.indexOf(this.end)
    }
}