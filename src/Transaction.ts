import * as crypto from 'crypto'
import addressFromPublicKey from './addressFromPublicKey'
import parseBigInt from './parseBigInt'
import beautifyBigInt from './beautifyBigInt'
import * as secp256k1 from 'secp256k1'
import publicKeyFromPrivateKey from './publicKeyFromPrivateKey'
import * as config_minify from '../config/minify.json'
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
            if (config_minify.transaction[property] !== undefined) {
                if (input[property] instanceof Buffer) output[config_minify.transaction[property]] = input[property].toString('binary')
                else output[config_minify.transaction[property]] = input[property]
            }
        }
        return output
    }
    static beautify(input) {
        const output = {}
            for (const property in input) {
                for (const _property in config_minify.transaction) {
                    if (property === config_minify.transaction[_property]) {
                        output[_property] = input[property]
                    }
                }
            }
        return <any> output
    }    
    static calculateHash(transaction: Transaction) {
        let buf = Buffer.alloc(0)
        if (transaction.from) buf = Buffer.concat([ buf, transaction.from ])
        if (transaction.to) buf = Buffer.concat([ buf, transaction.to ])
        if (transaction.amount) buf = Buffer.concat([ buf, Buffer.from(parseBigInt(transaction.amount).toString(16), 'hex') ])
        if (transaction.minerFee) buf = Buffer.concat([ buf, Buffer.from(parseBigInt(transaction.minerFee).toString(16), 'hex') ])
        if (transaction.timestamp) buf = Buffer.concat([ buf, Buffer.from(transaction.timestamp.toString(16), 'hex') ])
        return crypto.createHash('sha256').update(buf).digest()
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
            const publicKey = secp256k1.ecdsaRecover(this.signature, this.recoveryParam, hash, false)
            const address = addressFromPublicKey(publicKey)
            if (!address.equals(this.from)) return false
            return true
        }
        catch {
            return false
        }
    }
    isValid() {
        if (typeof this.from !== 'object') return 0x1n
        if (this.from instanceof Buffer === false) return 0x2n
        if (typeof this.to === 'object') {
            if (this.to instanceof Buffer === false) return 0x4n
            if (Buffer.byteLength(this.to) !== 20) return 0x8n
            if (typeof this.amount !== 'string') return 0x10n
            const amount = parseBigInt(this.amount)
            if (amount === null
                || amount <= 0
                || beautifyBigInt(amount) !== this.amount) return 0x20n
        }
        else if (typeof this.to !== 'undefined') return 0x40n
        if (this.to === undefined && this.amount !== undefined) return 0x80n
        if (typeof this.signature !== 'object') return 0x100n
        if (this.signature instanceof Buffer === false) return 0x200n
        if (!Number.isInteger(this.timestamp) || !Number.isFinite(this.timestamp)) return 0x400n
        if (this.timestamp > Date.now()) return 0x800n
        if (typeof this.minerFee !== 'string') return 0x1000n
        const minerFee = parseBigInt(this.minerFee)
            if (minerFee === null
                || minerFee < 0
                || beautifyBigInt(minerFee) !== this.minerFee) return 0x2000n
        if (typeof this.recoveryParam !== 'number') return 0x4000n
        if (this.recoveryParam >> 2) return 0x8000n
        if (this.verify() === false) return 0x10000n
        return 0x0n
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