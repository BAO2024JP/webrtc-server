import { DurableObject } from "cloudflare:workers";

export class Chat extends DurableObject {
	constructor(ctx, env) {
		super(ctx, env);

		this.sessions = new Map()
		this.ctx.getWebSockets().forEach(ws => {
			this.sessions.set(ws, {...ws.deserializeAttachment()})
		})
	}

	async fetch(_req) {
		const pair = new WebSocketPair()
		this.ctx.acceptWebSocket(pair[1])
		this.sessions.set(pair[1],{})
		return new Response(null, {status: 101, webSocket: pair[0]})
	}

	webSocketMessage(ws, msg) {
		const session = this.sessions.get(ws);
		const messageData = JSON.parse(msg);
		if(!session.id){
			session.id = crypto.randomUUID()
			session.from = messageData.from
			ws.serializeAttachment({...ws.deserializeAttachment(), id:session.id})
			ws.send(JSON.stringify({ready:true, id:session.id, from:session.from}))
		}
		this.broadcast(ws, messageData)
	}
	broadcast(sender, msg) {
		const id = this.sessions.get(sender).id
		const from = this.sessions.get(sender).from
		for(let[ws] of this.sessions){
			if( ws === sender) continue;
			switch (typeof msg) {
				case 'string':
					ws.send(JSON.stringify({...JSON.parse(msg), id, from}))
					break;
				default:
					ws.send(JSON.stringify({...msg, id, from}))
					break;
			}
		}
	}
	close(ws){
		const session = this.sessions.get(ws)
		console.log("session", session)
		if(!session?.id) return
		this.broadcast(ws, {type:'left'})
		this.sessions.delete(ws)
	}
	webSocketClose(ws){
		this.close(ws)
	}
	webSocketError(ws){
		this.close(ws)
	}
}

export default {
	async fetch(request, env, ctx) {
		const upgrade = request.headers.get('Upgrade')
		if(!upgrade || upgrade != 'websocket'){
			return new Response("websocket", {status:426})
		}
		let id = env.CHAT.idFromName(new URL(request.url).pathname);
		let chat = env.CHAT.get(id);
		return chat.fetch(request);
	},
};
