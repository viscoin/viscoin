import * as net from 'net'
import isValidOnion from './isValidOnion'
export default (host: string) => {
    return !(net.isIP(host) === 0
    && isValidOnion(host) === false)
}