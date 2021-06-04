import base58 from './base58'
export default address => {
    let valid = true
    try {
        if (Buffer.byteLength(base58.decode(address)) !== 20) valid = false
    }
    catch {
        valid = false
    }
    return valid
}