import Block from "./Block"
import Transaction from "./Transaction"

const types = [
    'block',
    'transaction',
    'node'
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
    constructBuffer(type: types_string | number, data: object) {
        return Buffer.concat([
            Buffer.alloc(1, this.getType(type)),
            Buffer.from(JSON.stringify(data), 'binary'),
            this.end
        ])
    },
    parse(buffer: Buffer) {
        try {
            const type = this.getType(buffer[0])
            if (type === null) return null
            let data = JSON.parse(buffer.slice(1).toString('binary'))
            switch (type) {
                case 'block':
                    data = new Block(Block.beautify(data))
                    break
                case 'transaction':
                    data = new Transaction(Transaction.beautify(data))
                    break
                case 'node':
                    data = {
                        port: data.port,
                        address: data.address
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
    ]),
    getEndIndex(data: Buffer) {
        return data.indexOf(this.end)
    }
}