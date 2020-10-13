import ServerNode from './src/class/ServerNode'

const serverNode = new ServerNode()
serverNode.start('localhost', 8333)
serverNode.on('data', (data) => {
    if (!serverNode.verifyData(data)) return
    console.log(data)
    serverNode.broadcast(data)
})