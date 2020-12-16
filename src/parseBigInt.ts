export default (str: string) => {
    const signs = []
    for (const sign of [ '.', ',' ]) {
        if (str.includes(sign)) signs.push(sign)
        else continue
    }
    if (signs.length > 1) return null
    const sign = signs[0]
    if (sign) {
        if (str.replace(sign, '').includes(sign)) return null
        const index = str.indexOf(sign)
        while (str.slice(index).length <= 15) {
            str += '0'
        }
        str = str.replace(sign, '')
    }
    else str += '000000000000000'
    try {
        return BigInt(str)
    }
    catch {
        return null
    }
}