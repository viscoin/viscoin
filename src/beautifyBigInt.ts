export default (bigint: bigint) => {
    if (bigint === 0n) return '0'
    const str = String(bigint)
    const arr = str.split('')
    while (arr.length <= 15) {
        arr.unshift('0')
    }
    arr.splice(arr.length - 15, 0, '.').join('').toString()
    let i = 0
    while (arr.length && [ '0', '.' ].includes(arr[arr.length - 1])) {
        arr.pop()
        if (i++ === 15) break
    }
    return arr.join('')
}