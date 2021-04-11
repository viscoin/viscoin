import * as core from '../config/core.json'
export default (bigint: bigint) => {
    if (bigint === 0n) return '0'
    if (!bigint) return null
    const str = String(bigint)
    const arr = str.split('')
    while (arr.length <= core.decimalPrecision) {
        arr.unshift('0')
    }
    arr.splice(arr.length - core.decimalPrecision, 0, '.').join('').toString()
    let i = 0
    while (arr.length && [ '0', '.' ].includes(arr[arr.length - 1])) {
        arr.pop()
        if (i++ === core.decimalPrecision) break
    }
    return arr.join('')
}