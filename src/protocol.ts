const types = [
    'null',
    'block',
    'transaction',
    'node'
] as const
type types_string = typeof types[number]
export default {
    types,
    getType(type: types_string | number): types_string | number {
        if (typeof type === 'string') {
            // !
            const index = this.types.indexOf(type)
            if (index === -1) throw new Error('getType index')
            return this.types.indexOf(type)
        }
        else if (typeof type === 'number') {
            return this.types[type]
        }
    },
    constructDataBuffer(type: types_string | number, data: any) {
        return Buffer.from(Buffer.alloc(1, this.getType(type)) + JSON.stringify(data))
    },
    parseDataBuffer(data: Buffer) {
        try {
            return {
                type: <string> this.getType(data[0]),
                data: JSON.parse(String(data.slice(1)))
            }
        } catch (err) {
            console.error(err)
            console.error(this.getType(data[0]))
            console.error(String(data.slice(1)))
            return null
        }
    },
    end: Buffer.alloc(32, 0),
    getEndIndex(data: Buffer) {
        return data.indexOf(this.end)
    }
}