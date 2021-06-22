import * as crypto from 'crypto'

class Address {
    static verifyChecksumAddress(address: Buffer) {
        const checksum = address.slice(-4)
        const hash = crypto.createHash('sha256').update(address.slice(0, Buffer.byteLength(address) - 4)).digest()
        return checksum.equals(hash.slice(-4))
    }
    static convertToChecksumAddress(address: Buffer) {
        while (address[0] === 0) address = address.slice(1)
        const checksum = crypto.createHash('sha256').update(address).digest().slice(-4)
        return Buffer.concat([ address, checksum ])
    }
    static convertToNormalAddress(address: Buffer) {
        address = address.slice(0, Buffer.byteLength(address) - 4)
        while (Buffer.byteLength(address) < 20) address = Buffer.concat([ Buffer.alloc(1, 0x00), address ])
        return address
    }
}
export default Address