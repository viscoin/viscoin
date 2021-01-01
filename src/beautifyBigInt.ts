import * as config from '../config.json'
export default (bigint: bigint) => {
    if (bigint === 0n) return '0'
    const str = String(bigint)
    const arr = str.split('')
    while (arr.length <= config.Blockchain.decimalPrecision) {
        arr.unshift('0')
    }
    arr.splice(arr.length - config.Blockchain.decimalPrecision, 0, '.').join('').toString()
    let i = 0
    while (arr.length && [ '0', '.' ].includes(arr[arr.length - 1])) {
        arr.pop()
        if (i++ === config.Blockchain.decimalPrecision) break
    }
    return arr.join('')
}