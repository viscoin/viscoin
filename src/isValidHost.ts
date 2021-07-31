export default (host: string) => {
    if (typeof host !== 'string') return 1
    if (host !== host.trim()) return 2
    if (host !== 'localhost') {
        if (host.includes('.')) {
            if (Buffer.byteLength(Buffer.from(host.split('.').filter(e => e))) !== 4) return 3
        }
        else if (host.includes(':')) {
            if (Buffer.byteLength(Buffer.from(host.split(':').filter(e => e))) > 8) return 4
        }
        else return 5
    }
    return 0
}