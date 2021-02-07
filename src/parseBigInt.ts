import * as config from '../config.json'
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
        while (str.slice(index).length <= config.Blockchain.decimalPrecision) {
            str += '0'
        }
        str = str.replace(sign, '')
    }
    else str += new Array(config.Blockchain.decimalPrecision).fill('0').join('')
    try {
        return BigInt(str)
    }
    catch {
        return null
    }
}