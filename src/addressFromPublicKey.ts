import customHash from './customHash'
export default (publicKey: Buffer) => {
    return customHash(publicKey).slice(-20)
}