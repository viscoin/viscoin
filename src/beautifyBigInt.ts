export default (bigint: string | bigint) => {
    bigint = BigInt(bigint)
    if (bigint === 0n) return '0'
    bigint = String(bigint)
    const arr = bigint.split('')
    while (arr.length <= 15) {
        arr.unshift('0')
    }
    arr.splice(arr.length - 15, 0, '.').join('').toString()
    while (arr.length && [ '0', '.' ].includes(arr[arr.length - 1])) {
        arr.pop()
    }
    return arr.join('')
}