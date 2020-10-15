import ServerNode from './src/class/ServerNode'

const serverNode = new ServerNode()
serverNode.start('localhost', 8333)
serverNode.on('data', (data) => {
    if (!serverNode.verifyData(data)) return
    const processed = serverNode.processData(data)
    if (!processed) return
    serverNode.broadcast(data)
    console.log(processed.type)
})