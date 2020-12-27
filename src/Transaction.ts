import * as elliptic from 'elliptic'
import customHash from './customHash'
import addressFromPublicKey from './addressFromPublicKey'
import * as config from '../config.json'
interface Transaction {
    from: Buffer
    to: Buffer
    timestamp: number
    amount: string
    minerFee: string
    signature: Buffer,
    recoveryParam: number
    data: Buffer
}
class Transaction {
    constructor({ from = undefined, to = undefined, amount = undefined, timestamp = undefined, minerFee = undefined, signature = undefined, recoveryParam = undefined, data = undefined }) {
        if (timestamp) this.timestamp = timestamp

        if (typeof minerFee === 'string') this.minerFee = minerFee

        if (from instanceof Buffer) this.from = from
        else if (from) this.from = Buffer.from(from, 'binary')

        if (data instanceof Buffer) this.data = data
        else if (data) this.data = Buffer.from(data, 'binary')

        if (typeof amount === 'string') {
            if (to instanceof Buffer) this.to = to
            else if (to) this.to = Buffer.from(to, 'binary')

            this.amount = amount
        }

        if (typeof recoveryParam === 'number') {
            if (signature instanceof Buffer) this.signature = signature
            else if (signature) this.signature = Buffer.from(signature, 'binary')

            this.recoveryParam = recoveryParam
        }
    }
    static minify(input: Transaction) {
        const output = {}
        for (const property in input) {
            if (config.transaction[property]) {
                if (input[property] instanceof Buffer) output[config.transaction[property].name] = input[property].toString('binary')
                else output[config.transaction[property].name] = input[property]
            }
        }
        return output
    }
    static beautify(input: object) {
        const output = {}
        for (const property in input) {
            for (const _property in config.transaction) {
                if (property === String(config.transaction[_property].name)) {
                    // !
                    switch (_property) {
                        // case 'to':
                        //     output[_property] = Buffer.from(input[property], 'binary')
                        //     break
                        // case 'from':
                        //     output[_property] = Buffer.from(input[property], 'binary')
                        //     break
                        // case 'data':
                        //     output[_property] = Buffer.from(input[property], 'binary')
                        //     break
                        // case 'signature':
                        //     output[_property] = Buffer.from(input[property], 'binary')
                        //     break
                        default:
                            output[_property] = input[property]
                            break
                    }
                }
            }
        }
        return <Transaction> output
    }
    calculateHash() {
        let buf = Buffer.alloc(0)
        if (this.from) buf = Buffer.concat([ buf, this.from ])
        if (this.to) buf = Buffer.concat([ buf, this.to ])
        if (this.data) buf = Buffer.concat([ buf, this.data ])
        return customHash(
            buf.toString('binary')
            + this.amount
            + this.minerFee
            + this.timestamp
        )
    }
    sign(privateKey: Buffer) {
        const ec = new elliptic.ec('secp256k1')
        const key = ec.keyFromPrivate(privateKey)
        const pubPoint = key.getPublic()
        const publicKey = Buffer.from(pubPoint.encode())
        this.from = addressFromPublicKey(publicKey)
        const hash = this.calculateHash()
        const signature = key.sign(hash)
        this.signature = Buffer.from(signature.toDER())
        this.recoveryParam = signature.recoveryParam
    }
    verify() {
        try {
            if (!this.signature) return false
            if (typeof this.recoveryParam !== 'number' || this.recoveryParam >> 2) return false
            const ec = new elliptic.ec('secp256k1')
            const hash = this.calculateHash()
            const pubPoint = ec.recoverPubKey(hash, this.signature, this.recoveryParam)
            const publicKey = Buffer.from(pubPoint.encode())
            const address = addressFromPublicKey(publicKey)
            if (!address.equals(this.from)) return false
            const key = ec.keyFromPublic(pubPoint)
            return key.verify(hash, this.signature)
        }
        catch {
            return false
        }
    }
}
export default Transaction