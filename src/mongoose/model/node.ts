import * as mongoose from 'mongoose'
import schema_node from '../schema/node'
interface Node extends mongoose.Document {
    host: string,
    banned: number
}
export default mongoose.model<Node>("Node", schema_node)