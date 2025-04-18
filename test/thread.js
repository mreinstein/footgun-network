import * as Network from '../src/network-frontend.js'


// testing the shared worker + atomics implementation

const FPS = 100


async function main () {
	const n = Network.create()

	const endpoint = Network.addEndpoint(n, '0.0.0.0', 3000)
	const reliableChannelId = Network.addChannel(n, endpoint, Network.CHANNEL_UNRELIABLE)

	// construct and send a test message
	const msg = new Uint8Array(1024)
	for (let i=0; i < 19;i++)
		msg[i] = i * 10

	Network.sendMessage(endpoint, reliableChannelId, msg, 19)

	function tick () {
		const messages = Network.readMessages(endpoint, reliableChannelId)
		if (messages.length)
			console.log('yay! messsagessss:', messages)

		setTimeout(tick, 1000/FPS)
	}

	tick()
}


main()
