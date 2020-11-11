export default {
    types: [
        'null',
        'block',
        'transaction',
        'node'
    ],
    getType(type: string | number): string | number {
        if (typeof type === 'string') {
            return this.types.indexOf(type)
        }
        else {
            return this.types[type]
        }
    },
    constructDataBuffer(type: string, data: any) {
        return Buffer.from(Buffer.alloc(1, this.getType(type)) + JSON.stringify(data))
    },
    parseDataBuffer(data: Buffer) {
        try {
            return {
                type: <string> this.getType(data[0]),
                data: JSON.parse(String(data.slice(1)))
            }
        } catch (err) {
            return null
        }
    }
}