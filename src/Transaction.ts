import * as crypto from 'crypto'
import addressFromPublicKey from './addressFromPublicKey'
import * as config_mongoose from '../config/mongoose.json'
import * as config_settings from '../config/settings.json'
import parseBigInt from './parseBigInt'
import beautifyBigInt from './beautifyBigInt'
import * as secp256k1 from 'secp256k1'
import publicKeyFromPrivateKey from './publicKeyFromPrivateKey'
import * as Signature from 'elliptic/lib/elliptic/ec/signature'
interface Transaction {
    from: Buffer
    to: Buffer
    timestamp: number
    amount: string
    minerFee: string
    signature: Buffer,
    recoveryParam: number
}
class Transaction {
    constructor({ from = undefined, to = undefined, amount = undefined, timestamp = undefined, minerFee = undefined, signature = undefined, recoveryParam = undefined }) {
        if (timestamp) this.timestamp = timestamp
        if (typeof minerFee === 'string') this.minerFee = minerFee
        if (from instanceof Buffer) this.from = from
        else if (from) this.from = Buffer.from(from, 'binary')
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
            if (config_mongoose.transaction[property] !== undefined) {
                if (input[property] instanceof Buffer) output[config_mongoose.transaction[property].name] = input[property].toString('binary')
                else output[config_mongoose.transaction[property].name] = input[property]
            }
        }
        return output
    }
    static beautify(input: object) {
        const output = {}
        for (const property in input) {
            for (const _property in config_mongoose.transaction) {
                if (property === config_mongoose.transaction[_property].name.toString()) {
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
        return crypto.createHash('sha256').update(
            buf.toString('binary')
            + transaction.amount
            + transaction.minerFee
            + transaction.timestamp
        ).digest()
    }
    sign(privateKey: Buffer) {
        this.from = addressFromPublicKey(publicKeyFromPrivateKey(privateKey))
        const hash = Transaction.calculateHash(this)
        const signature = secp256k1.ecdsaSign(hash, privateKey)
        this.signature = Buffer.from(signature.signature)
        this.recoveryParam = signature.recid
    }
    verify() {
        try {
            if (this.signature === undefined) return false
            if (typeof this.recoveryParam !== 'number' || this.recoveryParam >> 2) return false
            const hash = Transaction.calculateHash(this)
            let signature = this.signature
            if (Buffer.byteLength(signature) !== 64) {
                const _signature = new Signature(signature)
                signature = Buffer.concat([
                    _signature.r.toArrayLike(Buffer, 'be', 32),
                    _signature.s.toArrayLike(Buffer, 'be', 32)
                ])
            }
            const publicKey = secp256k1.ecdsaRecover(signature, this.recoveryParam, hash, false)
            const address = addressFromPublicKey(publicKey)
            if (!address.equals(this.from)) return false
            return true
        }
        catch {
            return false
        }
    }
    isValid() {
        if (typeof this.from !== 'object') return 1
        if (this.from instanceof Buffer === false) return 2
        if (typeof this.to === 'object') {
            if (this.to instanceof Buffer === false) return 3
            if (Buffer.byteLength(this.to) !== 20) return 4
            if (typeof this.amount !== 'string') return 5
            const amount = parseBigInt(this.amount)
            if (amount === null
                || amount <= 0
                || beautifyBigInt(amount) !== this.amount) return 6
        }
        else if (typeof this.to !== 'undefined') return 7
        if (this.to === undefined && this.amount !== undefined) return 8
        if (typeof this.signature !== 'object') return 9
        if (this.signature instanceof Buffer === false) return 10
        if (typeof this.timestamp !== 'number') return 11
        if (this.timestamp > Date.now() + config_settings.maxDesync) return 12
        if (typeof this.minerFee !== 'string') return 13
        const minerFee = parseBigInt(this.minerFee)
            if (minerFee === null
                || minerFee < 0
                || beautifyBigInt(minerFee) !== this.minerFee) return 14
        if (typeof this.recoveryParam !== 'number') return 15
        if (this.recoveryParam >> 2) return 16
        if (this.verify() === false) return 17
        return 0
    }
    byteFee() {
        const bytes = BigInt(Buffer.byteLength(JSON.stringify(Transaction.minify(this))))
        const fee = parseBigInt(this.minerFee)
        if (fee === 0n) return {
            bigint: 0n,
            remainder: 0n
        }
        const bigint = fee / bytes
        const remainder = fee % bytes
        return {
            bigint,
            remainder
        }
    }
}
export default Transaction