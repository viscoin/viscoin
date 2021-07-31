import * as config_core from '../config/core.json'
export default (str: string) => {
    if (str === null) return null
    const signs = [ '.', ',' ].filter(e => str.includes(e))
    if (signs.length > 1) return null
    const [ sign ] = signs
    if (sign) {
        if (str.replace(sign, '').includes(sign)) return null
        const index = str.indexOf(sign)
        while (str.slice(index).length <= config_core.decimalPrecision) {
            str += '0'
        }
        str = str.replace(sign, '')
    }
    else str += new Array(config_core.decimalPrecision).fill('0').join('')
    try {
        return BigInt(str)
    }
    catch {
        return null
    }
}