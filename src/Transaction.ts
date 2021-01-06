import * as elliptic from 'elliptic'
import * as crypto from 'crypto'
import addressFromPublicKey from './addressFromPublicKey'
import * as config from '../config.json'
import parseBigInt from './parseBigInt'
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
        const output: object = {}
        for (const property in input) {
            if (config.mongoose.schema.transaction[property]) {
                if (input[property] instanceof Buffer) output[config.mongoose.schema.transaction[property].name] = input[property].toString('binary')
                else output[config.mongoose.schema.transaction[property].name] = input[property]
            }
        }
        return output
    }
    static beautify(input: object) {
        const output = {}
        for (const property in input) {
            for (const _property in config.mongoose.schema.transaction) {
                if (property === config.mongoose.schema.transaction[_property].name.toString()) {
                    output[_property] = input[property]
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
        return crypto.createHash('sha256').update(
            buf.toString('binary')
            + this.amount
            + this.minerFee
            + this.timestamp
        ).digest()
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
    byteFee() {
        const bytes = BigInt(Buffer.byteLength(JSON.stringify(Transaction.minify(this))))
        const fee = parseBigInt(this.minerFee)
        if (fee === 0n) return {
            bigint: 0n,
            remainder: 0n
        }
        const bigint = bytes / fee
        const remainder = fee % bytes
        return {
            bigint,
            remainder
        }
    }
}
export default Transaction