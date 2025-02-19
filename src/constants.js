
export const CHANNEL_UNRELIABLE = 0
export const CHANNEL_RELIABLE = 1


// channel config, from https://github.com/mas-bandwidth/yojimbo/blob/d8722261c7a93867c6c95c221966c714d4048b6f/include/yojimbo_config.h#L129C9-L133C246
// some of these will probably be useful here
/*
const sentPacketBufferSize = 1024;      ///< Number of packet entries in the sent packet sequence buffer. Please consider your packet send rate and make sure you have at least a few seconds worth of entries in this buffer.
const messageSendQueueSize = 1024;      ///< Number of messages in the send queue for this channel.
const messageReceiveQueueSize = 1024;   ///< Number of messages in the receive queue for this channel.
*/
const LIMIT_MESSAGES_PER_PACKET = 256       ///< Maximum number of messages to include in each packet. Will write up to this many messages, provided the messages fit into the channel packet budget and the number of bytes remaining in the packet.

/*
const packetBudget = -1;                ///< Maximum amount of message data to write to the packet for this channel (bytes). Specifying -1 means the channel can use up to the rest of the bytes remaining in the packet.
const messageResendTime = 0.1;          ///< Minimum delay between message resends (seconds). Avoids sending the same message too frequently. Reliable-ordered channel only.


// client/server config, from https://github.com/mas-bandwidth/yojimbo/blob/d8722261c7a93867c6c95c221966c714d4048b6f/include/yojimbo_config.h#L195
// some of these will probably be useful here

const packetFragmentSize = 1024;        ///< Size of each packet fragment (bytes).
*/