import * as elliptic from 'elliptic'
import * as crypto from 'crypto'
import addressFromPublicKey from './addressFromPublicKey'
import * as config from '../config.json'
import parseBigInt from './parseBigInt'
import beautifyBigInt from './beautifyBigInt'
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
    static calculateHash(transaction: Transaction) {
        let buf = Buffer.alloc(0)
        if (transaction.from) buf = Buffer.concat([ buf, transaction.from ])
        if (transaction.to) buf = Buffer.concat([ buf, transaction.to ])
        if (transaction.data) buf = Buffer.concat([ buf, transaction.data ])
        return crypto.createHash('sha256').update(
            buf.toString('binary')
            + transaction.amount
            + transaction.minerFee
            + transaction.timestamp
        ).digest()
    }
    sign(privateKey: Buffer) {
        const ec = new elliptic.ec('secp256k1')
        const key = ec.keyFromPrivate(privateKey)
        const pubPoint = key.getPublic()
        const publicKey = Buffer.from(pubPoint.encode())
        this.from = addressFromPublicKey(publicKey)
        const hash = Transaction.calculateHash(this)
        const signature = key.sign(hash)
        this.signature = Buffer.from(signature.toDER())
        this.recoveryParam = signature.recoveryParam
    }
    verify() {
        try {
            if (!this.signature) return false
            if (typeof this.recoveryParam !== 'number' || this.recoveryParam >> 2) return false
            const ec = new elliptic.ec('secp256k1')
            const hash = Transaction.calculateHash(this)
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
    isValid() {
        // from
        if (typeof this.from !== 'object') return 1
        if (this.from instanceof Buffer === false) return 2
        // to
        if (typeof this.to === 'object') {
            if (this.to instanceof Buffer === false) return 3
            if (Buffer.byteLength(this.to) !== 20) return 4
            // amount
            if (typeof this.amount !== 'string') return 5
            const amount = parseBigInt(this.amount)
            if (amount === null
                || amount <= 0
                || beautifyBigInt(amount) !== this.amount) return 6
        }
        else if (typeof this.to !== 'undefined') return 7
        // signature
        if (typeof this.signature !== 'object') return 8
        if (this.signature instanceof Buffer === false) return 9
        // data
        if (typeof this.data === 'object') {
            if (this.data instanceof Buffer === false) return 10
            if (Buffer.byteLength(this.data) === 0) return 11
            if (Buffer.byteLength(this.data) > 32) return 12
        }
        else if (typeof this.data !== 'undefined') return 13
        // timestamp
        if (typeof this.timestamp !== 'number') return 14
        if (this.timestamp > Date.now() + config.Blockchain.maxDesync) return 15
        // minerFee
        if (typeof this.minerFee !== 'string') return 16
        const minerFee = parseBigInt(this.minerFee)
            if (minerFee === null
                || minerFee < 0
                || beautifyBigInt(minerFee) !== this.minerFee) return 17
        // recoveryParam
        if (typeof this.recoveryParam !== 'number') return 18
        if (this.recoveryParam >> 2) return 19
        return 0
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