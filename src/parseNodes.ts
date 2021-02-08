import * as configSettings from '../config/settings.json'
import * as os from 'os'
export default (str: string) => {    
    const EOL = configSettings.EOL === '' ? os.EOL : configSettings.EOL
    return [...new Set(str.split(EOL))].map(e => {
        const a = e.split(':')
        if (a.length !== 2 || a[0] === '' || a[1] === '' || isNaN(parseInt(a[1]))) return
        return {
            address: a[0],
            port: parseInt(a[1])
        }
    }).filter(e => e !== undefined)
}