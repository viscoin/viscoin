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
            console.error(err)
            console.error(this.getType(data[0]))
            console.error(String(data.slice(1)))
            return null
        }
    },
    end: Buffer.alloc(32, 0),
    getEndIndex(data: Buffer) {
        for (let i = 0; i < Buffer.byteLength(data); i++) {
            const part = data.slice(i, i + 32)
            // console.log(i, part)
            if (part.equals(this.end)) {
                console.log(i, part)
                return i
            }
        }
        return -1
    }
}